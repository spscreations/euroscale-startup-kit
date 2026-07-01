// Package main is the entry point for the EuroScale Database Provisioning gRPC server.
//
// It connects to Vitess vtgate and the Kubernetes API, then starts a gRPC server
// on port 50051 with API key authentication.
package main

import (
	"context"
	"crypto/x509"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/spscreations/euroscale-startup-kit/api/internal/auth"
	"github.com/spscreations/euroscale-startup-kit/api/internal/models"
	"github.com/spscreations/euroscale-startup-kit/api/internal/secrets"
	"github.com/spscreations/euroscale-startup-kit/api/internal/vitess"

	// Import generated protobuf code. Replace with actual generated package
	// after running protoc.
	pb "github.com/spscreations/euroscale-startup-kit/api/gen/euroscale/v1"
)

const (
	defaultGRPCPort = ":50051"
	sslMode         = "VERIFY_IDENTITY"
)

// server implements the DatabaseService gRPC server.
type server struct {
	pb.UnimplementedDatabaseServiceServer

	vtgate  *vitess.Manager
	secrets *secrets.Store

	host     string
	sslCAPem string
}

// ── gRPC method implementations ────────────────────────────────────────────

// CreateDatabase provisions a new Vitess database.
func (s *server) CreateDatabase(ctx context.Context, req *pb.CreateDatabaseRequest) (*pb.CreateDatabaseResponse, error) {
	// Validate the request.
	if req.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}
	if req.Engine != "" && req.Engine != models.EngineMySQL {
		return nil, status.Errorf(codes.InvalidArgument, "unsupported engine: %s", req.Engine)
	}
	if req.Region != "" && req.Region != models.RegionNuremberg && req.Region != models.RegionHelsinki {
		return nil, status.Errorf(codes.InvalidArgument, "unsupported region: %s", req.Region)
	}
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	// Default values.
	engine := req.Engine
	if engine == "" {
		engine = models.EngineMySQL
	}
	region := req.Region
	if region == "" {
		region = models.RegionNuremberg
	}

	dbID := uuid.New().String()
	dbName := req.Name
	now := time.Now().UTC()

	// Create the database in Vitess.
	if err := s.vtgate.CreateDatabase(ctx, dbName); err != nil {
		log.Printf("ERROR: failed to create vitess database %q: %v", dbName, err)
		return nil, status.Errorf(codes.Internal, "failed to create database: %v", err)
	}

	// Generate credentials.
	username, password, err := vitess.GenerateCredentials()
	if err != nil {
		log.Printf("ERROR: failed to generate credentials for %q: %v", dbID, err)
		// Best-effort cleanup of the created database.
		_ = s.vtgate.DeleteDatabase(context.Background(), dbName)
		return nil, status.Errorf(codes.Internal, "failed to generate credentials: %v", err)
	}

	// Build connection string.
	connStr := fmt.Sprintf("mysql://%s:%s@%s:3306/%s?ssl-mode=%s",
		username, password, s.host, dbName, sslMode)

	// Build the database model.
	db := &models.Database{
		ID:        dbID,
		Name:      dbName,
		Engine:    engine,
		Region:    region,
		Host:      s.host,
		Port:      3306,
		Username:  username,
		Status:    models.StatusReady,
		UserID:    req.UserId,
		CreatedAt: now,
	}

	creds := &models.DatabaseCredentials{
		DatabaseID:       dbID,
		Username:         username,
		Password:         password,
		ConnectionString: connStr,
		SSLCAPem:         s.sslCAPem,
	}

	// Store credentials as K8s Secret (pass db for metadata annotations).
	if err := s.secrets.SaveCredentials(ctx, db, creds); err != nil {
		log.Printf("ERROR: failed to store credentials for %q: %v", dbID, err)
		// Best-effort cleanup.
		_ = s.vtgate.DeleteDatabase(context.Background(), dbName)
		return nil, status.Errorf(codes.Internal, "failed to store credentials: %v", err)
	}

	log.Printf("INFO: created database %q (id=%s, user=%s, region=%s)", dbName, dbID, req.UserId, region)

	return &pb.CreateDatabaseResponse{
		DatabaseId:       dbID,
		ConnectionString: connStr,
		Host:             s.host,
		Port:             3306,
		Username:         username,
		Password:         password,
		SslCaPem:         s.sslCAPem,
		Engine:           engine,
		Region:           region,
		Status:           models.StatusReady,
		CreatedAt:        now.Format(time.RFC3339),
	}, nil
}

// DeleteDatabase drops a database and removes associated secrets.
func (s *server) DeleteDatabase(ctx context.Context, req *pb.DeleteDatabaseRequest) (*pb.DeleteDatabaseResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}

	// Retrieve credentials to find the database name.
	creds, err := s.secrets.GetCredentials(ctx, req.DatabaseId)
	if err != nil {
		log.Printf("ERROR: failed to get credentials for %q: %v", req.DatabaseId, err)
		return nil, status.Errorf(codes.NotFound, "database %q not found", req.DatabaseId)
	}

	// Drop the database in Vitess.
	if err := s.vtgate.DeleteDatabase(ctx, extractDBName(creds.ConnectionString)); err != nil {
		log.Printf("ERROR: failed to drop vitess database for %q: %v", req.DatabaseId, err)
		return nil, status.Errorf(codes.Internal, "failed to delete database: %v", err)
	}

	// Delete the K8s Secret.
	if err := s.secrets.DeleteCredentials(ctx, req.DatabaseId); err != nil {
		log.Printf("ERROR: failed to delete credentials for %q: %v", req.DatabaseId, err)
		// Database is already dropped — still return success.
	}

	log.Printf("INFO: deleted database %q", req.DatabaseId)

	return &pb.DeleteDatabaseResponse{
		Success: true,
		Message: fmt.Sprintf("database %q deleted successfully", req.DatabaseId),
	}, nil
}

// ListDatabases returns all databases owned by a user.
func (s *server) ListDatabases(ctx context.Context, req *pb.ListDatabasesRequest) (*pb.ListDatabasesResponse, error) {
	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}

	// List all euroscale-managed databases from K8s Secrets.
	allDBs, err := s.secrets.ListAll(ctx)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list databases: %v", err)
	}

	pageSize := int(req.PageSize)
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 50
	}

	// Filter by user_id.
	databases := make([]*pb.Database, 0)
	for _, db := range allDBs {
		if db.UserID != req.UserId {
			continue
		}
		pbDB := &pb.Database{
			DatabaseId: db.ID,
			Name:       db.Name,
			Engine:     db.Engine,
			Region:     db.Region,
			Host:       db.Host,
			Port:       db.Port,
			Username:   db.Username,
			Status:     db.Status,
			CreatedAt:  db.CreatedAt.Format(time.RFC3339),
		}
		databases = append(databases, pbDB)
	}

	return &pb.ListDatabasesResponse{
		Databases:     databases,
		NextPageToken: "",
		Total:         int32(len(databases)),
	}, nil
}

// GetDatabase returns metadata for a single database.
func (s *server) GetDatabase(ctx context.Context, req *pb.GetDatabaseRequest) (*pb.GetDatabaseResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}

	creds, err := s.secrets.GetCredentials(ctx, req.DatabaseId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "database %q not found", req.DatabaseId)
	}

	return &pb.GetDatabaseResponse{
		Database: &pb.Database{
			DatabaseId: creds.DatabaseID,
			Name:       extractDBName(creds.ConnectionString),
			Engine:     models.EngineMySQL,
			Host:       s.host,
			Port:       3306,
			Username:   creds.Username,
			Status:     models.StatusReady,
		},
	}, nil
}

// RotateCredentials generates new credentials and updates the K8s Secret.
func (s *server) RotateCredentials(ctx context.Context, req *pb.RotateCredentialsRequest) (*pb.RotateCredentialsResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}

	// Retrieve existing credentials to find the database name.
	existing, err := s.secrets.GetCredentials(ctx, req.DatabaseId)
	if err != nil {
		return nil, status.Errorf(codes.NotFound, "database %q not found", req.DatabaseId)
	}

	dbName := extractDBName(existing.ConnectionString)

	// Generate new credentials.
	username, password, err := vitess.GenerateCredentials()
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate credentials: %v", err)
	}

	// Build new connection string.
	connStr := fmt.Sprintf("mysql://%s:%s@%s:3306/%s?ssl-mode=%s",
		username, password, s.host, dbName, sslMode)

	// Build database model with preserved metadata.
	db := &models.Database{
		ID:        req.DatabaseId,
		Name:      dbName,
		Engine:    models.EngineMySQL,
		Region:    models.RegionNuremberg, // preserved from original; ideally read from existing secret
		Host:      s.host,
		Port:      3306,
		Username:  username,
		Status:    models.StatusReady,
		UserID:    "", // preserved from original
		CreatedAt: time.Now(), // not overwritten in practice
	}

	// Update the K8s Secret.
	newCreds := &models.DatabaseCredentials{
		DatabaseID:       req.DatabaseId,
		Username:         username,
		Password:         password,
		ConnectionString: connStr,
		SSLCAPem:         s.sslCAPem,
	}
	if err := s.secrets.UpdateCredentials(ctx, db, newCreds); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update credentials: %v", err)
	}

	log.Printf("INFO: rotated credentials for database %q", req.DatabaseId)

	return &pb.RotateCredentialsResponse{
		DatabaseId:       req.DatabaseId,
		ConnectionString: connStr,
		Username:         username,
		Password:         password,
		SslCaPem:         s.sslCAPem,
		Host:             s.host,
		Port:             3306,
	}, nil
}

// ── helpers ─────────────────────────────────────────────────────────────────

// extractDBName pulls the database name from a connection string like:
// mysql://user:pass@host:3306/dbname?ssl-mode=VERIFY_IDENTITY
func extractDBName(connStr string) string {
	// Find the last '/' after '@'.
	idx := 0
	for i, c := range connStr {
		if c == '@' {
			idx = i
		}
	}
	if idx == 0 {
		return connStr
	}

	rest := connStr[idx:]
	slashIdx := 0
	for i, c := range rest {
		if c == '/' {
			slashIdx = i
			break
		}
	}

	dbPart := rest[slashIdx+1:]

	// Strip query params.
	qIdx := 0
	for i, c := range dbPart {
		if c == '?' {
			qIdx = i
			break
		}
	}
	if qIdx > 0 {
		dbPart = dbPart[:qIdx]
	}

	return dbPart
}

// ── main ────────────────────────────────────────────────────────────────────

func main() {
	// Required env vars.
	vtgateAddr := os.Getenv("VTGATE_ADDR")
	if vtgateAddr == "" {
		vtgateAddr = "euroscale-vtgate:3306"
	}

	apiKey := os.Getenv("EUROSCALE_API_KEY")
	if apiKey == "" {
		log.Fatal("EUROSCALE_API_KEY environment variable is required")
	}

	namespace := os.Getenv("K8S_NAMESPACE")
	if namespace == "" {
		namespace = "euroscale"
	}

	// Parse optional env vars.
	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = defaultGRPCPort
	}

	host := os.Getenv("API_HOST")
	if host == "" {
		host = "db.euroscale.app"
	}

	// ── Connect to Vitess vtgate ────────────────────────────────────────────
	log.Printf("Connecting to vtgate at %s...", vtgateAddr)
	vtgateMgr, err := vitess.NewManager(vtgateAddr)
	if err != nil {
		log.Fatalf("Failed to connect to vtgate: %v", err)
	}
	defer vtgateMgr.Close()
	log.Println("Connected to vtgate successfully.")

	// ── Create K8s clientset (in-cluster config) ────────────────────────────
	config, err := rest.InClusterConfig()
	if err != nil {
		log.Fatalf("Failed to create in-cluster K8s config: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Failed to create K8s clientset: %v", err)
	}

	secretsStore := secrets.NewStore(clientset, namespace)
	log.Println("K8s clientset created successfully.")

	// ── Load SSL CA certificate ─────────────────────────────────────────────
	sslCAPem := loadSSLCert()

	// ── Build the gRPC server ───────────────────────────────────────────────
	srv := &server{
		vtgate:   vtgateMgr,
		secrets:  secretsStore,
		host:     host,
		sslCAPem: sslCAPem,
	}

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(auth.APIKeyInterceptor(apiKey)),
	)
	pb.RegisterDatabaseServiceServer(grpcServer, srv)

	// Enable gRPC reflection for debugging tools.
	reflection.Register(grpcServer)

	// ── Start the server ───────────────────────────────────────────────────
	lis, err := net.Listen("tcp", grpcPort)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", grpcPort, err)
	}

	// Graceful shutdown on SIGINT/SIGTERM.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("gRPC server listening on %s", grpcPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC server failed: %v", err)
		}
	}()

	<-stop
	log.Println("Shutting down gRPC server...")
	grpcServer.GracefulStop()
	log.Println("Server stopped.")
}

// loadSSLCert reads the CA certificate from the filesystem.
// In production this comes from cert-manager via a mounted Secret volume.
func loadSSLCert() string {
	certPath := os.Getenv("SSL_CA_CERT_PATH")
	if certPath == "" {
		certPath = "/etc/euroscale/tls/ca.crt"
	}

	data, err := os.ReadFile(certPath)
	if err != nil {
		log.Printf("WARNING: failed to load SSL CA cert from %s: %v", certPath, err)
		return ""
	}

	// Validate it's a proper PEM certificate.
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(data) {
		log.Printf("WARNING: failed to parse SSL CA cert from %s", certPath)
		return ""
	}

	log.Printf("Loaded SSL CA certificate from %s (%d bytes)", certPath, len(data))
	return string(data)
}
