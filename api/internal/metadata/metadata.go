// Package metadata provides read-only introspection of the Vitess cluster
// through INFORMATION_SCHEMA queries, scoped to what the authenticated user
// can access.
package metadata

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	_ "github.com/go-sql-driver/mysql"

	"github.com/spscreations/euroscale-startup-kit/api/internal/models"
	"github.com/spscreations/euroscale-startup-kit/api/internal/secrets"

	pb "github.com/spscreations/euroscale-startup-kit/api/gen/euroscale/v1"
)

// Service implements the MetadataService gRPC service.
type Service struct {
	pb.UnimplementedMetadataServiceServer
	secrets    *secrets.Store
	vtgateAddr string
	apiHost    string
}

// NewService creates a new MetadataService.
func NewService(secretsStore *secrets.Store, vtgateAddr, apiHost string) *Service {
	return &Service{
		secrets:    secretsStore,
		vtgateAddr: vtgateAddr,
		apiHost:    apiHost,
	}
}

// ListSchemaDatabases returns all databases visible to the user through vtgate.
func (s *Service) ListSchemaDatabases(ctx context.Context, req *pb.ListSchemaDatabasesRequest) (*pb.ListSchemaDatabasesResponse, error) {
	if req.UserId == "" {
		return nil, fmt.Errorf("user_id is required")
	}

	pageSize := int(req.PageSize)
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 25
	}
	page := int(req.Page)

	// Get user's database credentials from K8s secrets.
	allDBs, err := s.secrets.ListAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list databases: %w", err)
	}

	var userDBs []models.Database
	for _, db := range allDBs {
		if db.UserID == req.UserId {
			userDBs = append(userDBs, db)
		}
	}

	if len(userDBs) == 0 {
		return &pb.ListSchemaDatabasesResponse{
			Databases: []string{},
			Total:     0,
			Page:      int32(page),
			PageSize:  int32(pageSize),
		}, nil
	}

	db, err := s.connectForUser(ctx, req.UserId)
	if err != nil {
		// vtgate connection failed — fall back to database names from K8s secrets.
		log.Printf("WARN: connectForUser failed for %s, falling back to K8s secrets: %v", req.UserId, err)
		dbNames := make([]string, len(userDBs))
		for i, d := range userDBs {
			dbNames[i] = d.Name
		}
		total := len(dbNames)
		start := page * pageSize
		end := start + pageSize
		if start > total {
			start = total
		}
		if end > total {
			end = total
		}
		paginated := dbNames[start:end]
		return &pb.ListSchemaDatabasesResponse{
			Databases: paginated,
			Total:     int32(total),
			Page:      int32(page),
			PageSize:  int32(pageSize),
		}, nil
	}
	defer db.Close()

	// Query INFORMATION_SCHEMA to get all databases this user can see.
	rows, err := db.QueryContext(ctx,
		"SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA ORDER BY SCHEMA_NAME")
	if err != nil {
		return nil, fmt.Errorf("failed to query INFORMATION_SCHEMA.SCHEMATA: %w", err)
	}
	defer rows.Close()

	var allDatabases []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("failed to scan database name: %w", err)
		}
		allDatabases = append(allDatabases, name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating databases: %w", err)
	}

	// Apply pagination.
	total := len(allDatabases)
	start := page * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	paginated := allDatabases[start:end]

	return &pb.ListSchemaDatabasesResponse{
		Databases: paginated,
		Total:     int32(total),
		Page:      int32(page),
		PageSize:  int32(pageSize),
	}, nil
}

// ListTables returns all tables in a given database visible to the user.
func (s *Service) ListTables(ctx context.Context, req *pb.ListTablesRequest) (*pb.ListTablesResponse, error) {
	if req.UserId == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if req.Database == "" {
		return nil, fmt.Errorf("database is required")
	}

	pageSize := int(req.PageSize)
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 50
	}
	page := int(req.Page)

	db, err := s.connectForUser(ctx, req.UserId)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.QueryContext(ctx,
		"SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME",
		req.Database)
	if err != nil {
		return nil, fmt.Errorf("failed to query INFORMATION_SCHEMA.TABLES: %w", err)
	}
	defer rows.Close()

	var allTables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("failed to scan table name: %w", err)
		}
		allTables = append(allTables, name)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating tables: %w", err)
	}

	total := len(allTables)
	start := page * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	paginated := allTables[start:end]

	return &pb.ListTablesResponse{
		Tables:   paginated,
		Total:    int32(total),
		Page:     int32(page),
		PageSize: int32(pageSize),
	}, nil
}

// ListColumns returns column metadata for a table.
func (s *Service) ListColumns(ctx context.Context, req *pb.ListColumnsRequest) (*pb.ListColumnsResponse, error) {
	if req.UserId == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if req.Database == "" {
		return nil, fmt.Errorf("database is required")
	}
	if req.Table == "" {
		return nil, fmt.Errorf("table is required")
	}

	pageSize := int(req.PageSize)
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 50
	}
	page := int(req.Page)

	db, err := s.connectForUser(ctx, req.UserId)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	rows, err := db.QueryContext(ctx,
		`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, 
		 COALESCE(COLUMN_DEFAULT, ''), COALESCE(COLUMN_KEY, ''), 
		 COALESCE(EXTRA, ''), ORDINAL_POSITION
		 FROM INFORMATION_SCHEMA.COLUMNS 
		 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
		 ORDER BY ORDINAL_POSITION`,
		req.Database, req.Table)
	if err != nil {
		return nil, fmt.Errorf("failed to query INFORMATION_SCHEMA.COLUMNS: %w", err)
	}
	defer rows.Close()

	var allColumns []*pb.ColumnInfo
	for rows.Next() {
		col := &pb.ColumnInfo{}
		var ordPos int32
		if err := rows.Scan(&col.Name, &col.DataType, &col.IsNullable,
			&col.ColumnDefault, &col.ColumnKey, &col.Extra, &ordPos); err != nil {
			return nil, fmt.Errorf("failed to scan column info: %w", err)
		}
		col.OrdinalPosition = ordPos
		allColumns = append(allColumns, col)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating columns: %w", err)
	}

	total := len(allColumns)
	start := page * pageSize
	end := start + pageSize
	if start > total {
		start = total
	}
	if end > total {
		end = total
	}

	paginated := allColumns[start:end]

	return &pb.ListColumnsResponse{
		Columns:  paginated,
		Total:    int32(total),
		Page:     int32(page),
		PageSize: int32(pageSize),
	}, nil
}

// PreviewTable returns the first N rows of a table.
func (s *Service) PreviewTable(ctx context.Context, req *pb.PreviewTableRequest) (*pb.PreviewTableResponse, error) {
	if req.UserId == "" {
		return nil, fmt.Errorf("user_id is required")
	}
	if req.Database == "" {
		return nil, fmt.Errorf("database is required")
	}
	if req.Table == "" {
		return nil, fmt.Errorf("table is required")
	}

	limit := int(req.Limit)
	if limit <= 0 || limit > 100 {
		limit = 10
	}

	db, err := s.connectForUser(ctx, req.UserId)
	if err != nil {
		return nil, err
	}
	defer db.Close()

	// Sanitize table name to prevent SQL injection.
	// Only alphanumeric and underscores are allowed.
	if !isSafeIdentifier(req.Table) {
		return nil, fmt.Errorf("invalid table name: %s", req.Table)
	}
	if !isSafeIdentifier(req.Database) {
		return nil, fmt.Errorf("invalid database name: %s", req.Database)
	}

	// Use a parameterized query with backtick-quoted identifiers for safety.
	query := fmt.Sprintf("SELECT * FROM `%s`.`%s` LIMIT %d", req.Database, req.Table, limit)
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query table %s.%s: %w", req.Database, req.Table, err)
	}
	defer rows.Close()

	columns, err := rows.Columns()
	if err != nil {
		return nil, fmt.Errorf("failed to get columns: %w", err)
	}

	var pbRows []*pb.Row
	for rows.Next() {
		// Create a slice of interface{} to hold values
		values := make([]interface{}, len(columns))
		valuePtrs := make([]interface{}, len(columns))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, fmt.Errorf("failed to scan row: %w", err)
		}

		strValues := make([]string, len(columns))
		for i, v := range values {
			if v == nil {
				strValues[i] = "NULL"
			} else {
				// Convert to string representation
				switch val := v.(type) {
				case []byte:
					strValues[i] = string(val)
				default:
					strValues[i] = fmt.Sprintf("%v", val)
				}
			}
		}
		pbRows = append(pbRows, &pb.Row{Values: strValues})
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %w", err)
	}

	// Get approximate row count.
	var approxTotal int64
	err = db.QueryRowContext(ctx,
		"SELECT TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
		req.Database, req.Table).Scan(&approxTotal)
	if err != nil {
		log.Printf("metadata: failed to get approximate row count for %s.%s: %v", req.Database, req.Table, err)
		approxTotal = int64(len(pbRows))
	}

	return &pb.PreviewTableResponse{
		Columns:          columns,
		Rows:             pbRows,
		ApproximateTotal: approxTotal,
	}, nil
}

// connectForUser connects to vtgate using the first available database credential
// for the given user. The connection's INFORMATION_SCHEMA view is scoped to
// what that user can see.
func (s *Service) connectForUser(ctx context.Context, userID string) (*sql.DB, error) {
	allDBs, err := s.secrets.ListAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list databases: %w", err)
	}

	for _, d := range allDBs {
		if d.UserID == userID {
			creds, err := s.secrets.GetCredentials(ctx, d.ID)
			if err != nil {
				continue
			}
			db, err := s.connectAs(ctx, creds.Username, creds.Password)
			if err != nil {
				continue
			}
			return db, nil
		}
	}

	return nil, fmt.Errorf("no valid credentials found for user %s", userID)
}

// connectAs connects to vtgate as a specific MySQL user.
func (s *Service) connectAs(ctx context.Context, username, password string) (*sql.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s)/?timeout=10s&readTimeout=30s",
		username, password, s.vtgateAddr)

	conn, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open MySQL connection: %w", err)
	}

	conn.SetMaxOpenConns(3)
	conn.SetMaxIdleConns(1)

	if err := conn.PingContext(ctx); err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to ping vtgate: %w", err)
	}

	return conn, nil
}

// isSafeIdentifier checks that a string is safe to use as a SQL identifier.
func isSafeIdentifier(s string) bool {
	if s == "" || len(s) > 64 {
		return false
	}
	for _, r := range s {
		if !((r >= 'a' && r <= 'z') ||
			(r >= 'A' && r <= 'Z') ||
			(r >= '0' && r <= '9') ||
			r == '_') {
			return false
		}
	}
	return true
}
