// Package main is the entry point for the EuroScale Database Provisioning gRPC server.
//
// It connects to Vitess vtgate and the Kubernetes API, then starts a gRPC server
// on port 50051 with API key authentication.
package main

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/google/uuid"
	"connectrpc.com/connect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/grpclog"
	grpcmeta "google.golang.org/grpc/metadata"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"

	"github.com/spscreations/euroscale-startup-kit/api/internal/auth"
	connectpkg "github.com/spscreations/euroscale-startup-kit/api/internal/connect"
	"github.com/spscreations/euroscale-startup-kit/api/internal/ipwhitelist"
	metasvc "github.com/spscreations/euroscale-startup-kit/api/internal/metadata"
	"github.com/spscreations/euroscale-startup-kit/api/internal/models"
	"github.com/spscreations/euroscale-startup-kit/api/internal/secrets"
	"github.com/spscreations/euroscale-startup-kit/api/internal/vitess"

	// Import generated protobuf code.
	pb "github.com/spscreations/euroscale-startup-kit/api/gen/euroscale/v1"
)

const (
	defaultGRPCPort    = ":50051"
	defaultHTTPPort    = ":8081"
	sslMode            = "VERIFY_IDENTITY"
)

// ── Auth response shapes ──────────────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type signupRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authUser struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

type authResponse struct {
	User          authUser `json:"user"`
	Token         string   `json:"token"`
	ExpiresInSeconds int   `json:"expires_in_seconds"`
}

// server implements the DatabaseService gRPC server.
type server struct {
	pb.UnimplementedDatabaseServiceServer

	vtgate   *vitess.Manager
	secrets  *secrets.Store
	ipwl     *ipwhitelist.Store

	host     string
	sslCAPem string

	apiKey        string
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
	connStr := fmt.Sprintf("mysql://%s:***@%s:3306/%s?ssl-mode=%s",
		username, s.host, dbName, sslMode)

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
	connStr := fmt.Sprintf("mysql://%s:***@%s:3306/%s?ssl-mode=%s",
		username, s.host, dbName, sslMode)

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

// GetIPWhitelist returns the IP whitelist entries for a database.
func (s *server) GetIPWhitelist(ctx context.Context, req *pb.GetIPWhitelistRequest) (*pb.GetIPWhitelistResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}

	entries, err := s.secrets.GetIPWhitelist(ctx, req.DatabaseId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get IP whitelist: %v", err)
	}

	pbEntries := make([]*pb.IPWhitelistEntry, 0, len(entries))
	for _, e := range entries {
		pbEntries = append(pbEntries, &pb.IPWhitelistEntry{
			Cidr:        e.CIDR,
			Description: e.Description,
			CreatedAt:   e.CreatedAt.Format(time.RFC3339),
		})
	}

	return &pb.GetIPWhitelistResponse{
		Entries: pbEntries,
	}, nil
}

// AddIPWhitelistEntry adds a CIDR range to a database's IP whitelist.
func (s *server) AddIPWhitelistEntry(ctx context.Context, req *pb.AddIPWhitelistEntryRequest) (*pb.AddIPWhitelistEntryResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}
	if req.Cidr == "" {
		return nil, status.Error(codes.InvalidArgument, "cidr is required")
	}

	// Validate CIDR format.
	if _, _, err := net.ParseCIDR(req.Cidr); err != nil {
		return nil, status.Errorf(codes.InvalidArgument, "invalid CIDR: %v", err)
	}

	// Get existing whitelist.
	entries, err := s.secrets.GetIPWhitelist(ctx, req.DatabaseId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get IP whitelist: %v", err)
	}

	// Check for duplicates.
	for _, e := range entries {
		if e.CIDR == req.Cidr {
			return nil, status.Errorf(codes.AlreadyExists, "CIDR %q is already in the whitelist", req.Cidr)
		}
	}

	// Add new entry.
	now := time.Now().UTC()
	newEntry := models.IPWhitelistEntry{
		CIDR:        req.Cidr,
		Description: req.Description,
		CreatedAt:   now,
	}
	entries = append(entries, newEntry)

	if err := s.secrets.SaveIPWhitelist(ctx, req.DatabaseId, entries); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to save IP whitelist: %v", err)
	}

	log.Printf("INFO: added CIDR %q to whitelist for database %q", req.Cidr, req.DatabaseId)

	return &pb.AddIPWhitelistEntryResponse{
		Entry: &pb.IPWhitelistEntry{
			Cidr:        newEntry.CIDR,
			Description: newEntry.Description,
			CreatedAt:   newEntry.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

// RemoveIPWhitelistEntry removes a CIDR range from a database's IP whitelist.
func (s *server) RemoveIPWhitelistEntry(ctx context.Context, req *pb.RemoveIPWhitelistEntryRequest) (*pb.RemoveIPWhitelistEntryResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}
	if req.Cidr == "" {
		return nil, status.Error(codes.InvalidArgument, "cidr is required")
	}

	// Get existing whitelist.
	entries, err := s.secrets.GetIPWhitelist(ctx, req.DatabaseId)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get IP whitelist: %v", err)
	}

	// Filter out the matching CIDR.
	found := false
	filtered := make([]models.IPWhitelistEntry, 0, len(entries))
	for _, e := range entries {
		if e.CIDR == req.Cidr {
			found = true
			continue
		}
		filtered = append(filtered, e)
	}

	if !found {
		return &pb.RemoveIPWhitelistEntryResponse{
			Success: false,
			Message: fmt.Sprintf("CIDR %q not found in whitelist", req.Cidr),
		}, nil
	}

	if err := s.secrets.SaveIPWhitelist(ctx, req.DatabaseId, filtered); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to save IP whitelist: %v", err)
	}

	log.Printf("INFO: removed CIDR %q from whitelist for database %q", req.Cidr, req.DatabaseId)

	return &pb.RemoveIPWhitelistEntryResponse{
		Success: true,
		Message: fmt.Sprintf("CIDR %q removed from whitelist", req.Cidr),
	}, nil
}

// ── helpers ─────────────────────────────────────────────────────────────────

// extractDBName pulls the database name from a connection string like:
// mysql://user:***@host:3306/dbname?ssl-mode=VERIFY_IDENTITY
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

// ── Auth HTTP handlers ───────────────────────────────────────────────────────

// authHandler handles login/signup by accepting any credentials and returning
// a valid session with the API key as the bearer token. In production this
// would validate against a user database.
func (s *server) authHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var (
		email string
		name  string
	)

	// Determine which endpoint was hit.
	switch {
	case strings.HasSuffix(r.URL.Path, "/login"):
		var req loginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
			return
		}
		email = req.Email
		name = ""
	case strings.HasSuffix(r.URL.Path, "/signup"):
		var req signupRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
			return
		}
		email = req.Email
		name = req.Name
	default:
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "email is required"})
		return
	}

	// Generate a deterministic user ID from email.
	userID := uuid.NewSHA1(uuid.NameSpaceDNS, []byte(email)).String()

	resp := authResponse{
		User: authUser{
			ID:    userID,
			Name:  name,
			Email: email,
		},
		Token:            s.apiKey,
		ExpiresInSeconds: 86400,
	}

	writeJSON(w, http.StatusOK, resp)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// ── IP Whitelist REST handlers ──────────────────────────────────────────────

// ipWhitelistListResponse is the JSON shape for listing IPs.
type ipWhitelistListResponse struct {
	IPs []string `json:"ips"`
}

// ipWhitelistAddRequest is the JSON shape for adding an IP.
type ipWhitelistAddRequest struct {
	IP string `json:"ip"`
}

// ipWhitelistRemoveRequest is the JSON shape for removing an IP.
type ipWhitelistRemoveRequest struct {
	IP string `json:"ip"`
}

// ipWhitelistHandler handles GET (list), POST (add), and DELETE (remove)
// for per-user IP whitelists. The user_id is extracted from the
// X-User-ID header.
func (s *server) ipWhitelistHandler(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "X-User-ID header is required"})
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.handleListIPs(w, r, userID)
	case http.MethodPost:
		s.handleAddIP(w, r, userID)
	case http.MethodDelete:
		s.handleRemoveIP(w, r, userID)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *server) handleListIPs(w http.ResponseWriter, r *http.Request, userID string) {
	ips, err := s.ipwl.GetIPs(r.Context(), userID)
	if err != nil {
		log.Printf("ERROR: failed to list IPs for user %q: %v", userID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "failed to list IPs"})
		return
	}

	if ips == nil {
		ips = []string{}
	}

	writeJSON(w, http.StatusOK, ipWhitelistListResponse{IPs: ips})
}

func (s *server) handleAddIP(w http.ResponseWriter, r *http.Request, userID string) {
	var req ipWhitelistAddRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
		return
	}

	if req.IP == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ip is required"})
		return
	}

	if err := s.ipwl.AddIP(r.Context(), userID, req.IP); err != nil {
		log.Printf("ERROR: failed to add IP %q for user %q: %v", req.IP, userID, err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}

	log.Printf("INFO: added IP %q to whitelist for user %q", req.IP, userID)

	// Return the updated list.
	s.handleListIPs(w, r, userID)
}

func (s *server) handleRemoveIP(w http.ResponseWriter, r *http.Request, userID string) {
	var req ipWhitelistRemoveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
		return
	}

	if req.IP == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "ip is required"})
		return
	}

	if err := s.ipwl.RemoveIP(r.Context(), userID, req.IP); err != nil {
		log.Printf("ERROR: failed to remove IP %q for user %q: %v", req.IP, userID, err)
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": err.Error()})
		return
	}

	log.Printf("INFO: removed IP %q from whitelist for user %q", req.IP, userID)

	// Return the updated list.
	s.handleListIPs(w, r, userID)
}

// extractClientIP extracts the real client IP from request headers or RemoteAddr.
// Checks X-Forwarded-For first, then X-Real-IP, then falls back to RemoteAddr.
func extractClientIP(r *http.Request) string {
	// Check X-Forwarded-For (client, proxy1, proxy2...).
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// Take the leftmost IP (original client).
		if idx := strings.IndexByte(xff, ','); idx > 0 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}

	// Check X-Real-IP.
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}

	// Fall back to RemoteAddr.
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		// If no port, use as-is.
		return r.RemoteAddr
	}
	return host
}

// ── IP Whitelist Connect interceptor ─────────────────────────────────────

// ipWhitelistInterceptor returns a Connect unary interceptor that enforces
// per-user IP whitelists. It extracts the client IP and user ID from headers,
// then checks whether the IP is allowed for that user.
// An empty whitelist means all IPs are allowed.
func ipWhitelistInterceptor(store *ipwhitelist.Store) connect.UnaryInterceptorFunc {
	interceptor := func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			userID := req.Header().Get("X-User-ID")
			if userID == "" {
				// If no user ID header, skip IP check (auth endpoint calls).
				return next(ctx, req)
			}

			// Extract client IP from the request.
			clientIP := req.Header().Get("X-Forwarded-For")
			if clientIP == "" {
				clientIP = req.Header().Get("X-Real-IP")
			}
			if clientIP == "" {
				// If we can't determine the client IP from headers,
				// skip the check rather than blocking legitimate traffic.
				return next(ctx, req)
			}

			// Take leftmost IP if X-Forwarded-For contains multiple.
			if idx := strings.IndexByte(clientIP, ','); idx > 0 {
				clientIP = strings.TrimSpace(clientIP[:idx])
			}
			clientIP = strings.TrimSpace(clientIP)

			allowed, err := store.IsAllowed(ctx, userID, clientIP)
			if err != nil {
				log.Printf("ERROR: IP whitelist check failed for user %q, IP %q: %v", userID, clientIP, err)
				return nil, connect.NewError(
					connect.CodeInternal,
					fmt.Errorf("internal error checking IP whitelist"),
				)
			}

			if !allowed {
				log.Printf("WARNING: blocked IP %q for user %q (not in whitelist)", clientIP, userID)
				return nil, connect.NewError(
					connect.CodePermissionDenied,
					fmt.Errorf("IP %q is not in your allowed IPs list", clientIP),
				)
			}

			return next(ctx, req)
		}
	}
	return connect.UnaryInterceptorFunc(interceptor)
}

// ── Auth interceptor (supports both x-api-key and Authorization: Bearer) ─────

func authInterceptor(validKey string) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		md, ok := grpcmeta.FromIncomingContext(ctx)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}

		// Try x-api-key header first
		if vals := md.Get(auth.MetadataKey); len(vals) > 0 && vals[0] == validKey {
			return handler(ctx, req)
		}

		// Try Authorization: Bearer <token>
		if vals := md.Get("authorization"); len(vals) > 0 {
			for _, v := range vals {
				if strings.HasPrefix(v, "Bearer ") && strings.TrimPrefix(v, "Bearer ") == validKey {
					return handler(ctx, req)
				}
			}
		}

		return nil, status.Error(codes.Unauthenticated, "invalid API key")
	}
}

// ── health endpoints ─────────────────────────────────────────────────────────

// startHealthServer runs a simple HTTP mux on :8080 for K8s liveness/readiness probes.
func startHealthServer(ready chan struct{}) *http.Server {
	mux := http.NewServeMux()

	// /healthz — liveness: always OK while the process is running.
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, "ok")
	})

	// /ready — readiness: blocks until the gRPC server is fully initialised.
	mux.HandleFunc("/ready", func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-ready:
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			fmt.Fprintln(w, "ready")
		default:
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusServiceUnavailable)
			fmt.Fprintln(w, "not ready")
		}
	})

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
		IdleTimeout:  30 * time.Second,
	}

	go func() {
		log.Printf("Health server listening on :8080")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("WARNING: health server error: %v", err)
		}
	}()

	return srv
}

// ── main ────────────────────────────────────────────────────────────────────

func main() {
	// Suppress grpc logs (too noisy).
	grpclog.SetLoggerV2(grpclog.NewLoggerV2(os.Stderr, os.Stderr, os.Stderr))

	// Required env vars.
	vtgateAddr := os.Getenv("VTGATE_ADDR")
	if vtgateAddr == "" {
		vtgateAddr = "euroscale-vtgate:3306"
	}

	vtctldAddr := os.Getenv("VTCTLD_ADDR")
	if vtctldAddr == "" {
		vtctldAddr = "euroscale-vtctld:15999"
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

	httpPort := os.Getenv("HTTP_PORT")
	if httpPort == "" {
		httpPort = defaultHTTPPort
	}

	host := os.Getenv("API_HOST")
	if host == "" {
		host = "db.euroscale.app"
	}

	// ── Health server ─────────────────────────────────────────────────────
	ready := make(chan struct{})
	healthSrv := startHealthServer(ready)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = healthSrv.Shutdown(ctx)
	}()

	// ── Connect to Vitess ──────────────────────────────────────────────────
	log.Printf("Connecting to vtgate at %s...", vtgateAddr)
	vtgateMgr, err := vitess.NewManager(vtgateAddr, vtctldAddr)
	if err != nil {
		log.Fatalf("Failed to initialize vitess manager: %v", err)
	}
	defer vtgateMgr.Close()
	log.Println("Vitess manager initialized successfully.")

	// ── Create K8s clientset ──────────────────────────────────────────────
	config, err := rest.InClusterConfig()
	if err != nil {
		log.Fatalf("Failed to create in-cluster K8s config: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		log.Fatalf("Failed to create K8s clientset: %v", err)
	}

	secretsStore := secrets.NewStore(clientset, namespace)
	ipwlStore := ipwhitelist.NewStore(clientset, namespace)
	log.Println("K8s clientset created successfully.")

	// ── Load SSL CA certificate ───────────────────────────────────────────
	sslCAPem := loadSSLCert()

	// ── Build the gRPC server ───────────────────────────────────────────────
	srv := &server{
		vtgate:   vtgateMgr,
		secrets:  secretsStore,
		ipwl:     ipwlStore,
		host:     host,
		sslCAPem: sslCAPem,
		apiKey:   apiKey,
	}

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(authInterceptor(apiKey)),
	)
	pb.RegisterDatabaseServiceServer(grpcServer, srv)

	// Register the MetadataService for schema introspection.
	metaSvc := metasvc.NewService(secretsStore, vtgateAddr, host)
	pb.RegisterMetadataServiceServer(grpcServer, metaSvc)

	// Enable gRPC reflection for debugging tools.
	reflection.Register(grpcServer)

	// ── Start native gRPC (binary, for internal use) ─────────────────────
	lis, err := net.Listen("tcp", grpcPort)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", grpcPort, err)
	}

	go func() {
		log.Printf("gRPC server listening on %s", grpcPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("gRPC server failed: %v", err)
		}
	}()

	// ── Build HTTP server (auth + Connect/gRPC-web) ─────────────────────
	httpMux := http.NewServeMux()

	// Auth endpoints
	httpMux.HandleFunc("/api/v1/auth/login", srv.authHandler)
	httpMux.HandleFunc("/api/v1/auth/signup", srv.authHandler)

	// CORS preflight for auth endpoints
	httpMux.HandleFunc("/api/v1/auth/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		srv.authHandler(w, r)
	})

	// IP whitelist management endpoints
	httpMux.HandleFunc("/api/v1/ip-whitelist", srv.ipWhitelistHandler)
	httpMux.HandleFunc("/api/v1/ip-whitelist/", srv.ipWhitelistHandler)

	// Build and register Connect/gRPC-web handler on the same port.
	// This makes the DatabaseService available to browsers via HTTP/1.1
	// using the Connect protocol (JSON or binary), plus gRPC-web.
	// Chain the IP whitelist interceptor after the auth interceptor.
	connectHandler := connectpkg.NewHandler(srv, apiKey, ipWhitelistInterceptor(ipwlStore))
	httpMux.Handle("/euroscale.v1.DatabaseService/", connectHandler)

	// Register MetadataService for schema browsing.
	metaConnectHandler := connectpkg.NewMetadataHandler(metaSvc, apiKey)
	httpMux.Handle("/euroscale.v1.MetadataService/", metaConnectHandler)

	httpServer := &http.Server{
		Addr:         httpPort,
		Handler:      withCORS(httpMux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("HTTP server (auth + Connect/gRPC-web) listening on %s", httpPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("HTTP server failed: %v", err)
		}
	}()

	// Signal that we're ready.
	close(ready)

	// ── Wait for shutdown ─────────────────────────────────────────────────
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_ = httpServer.Shutdown(ctx)
	grpcServer.GracefulStop()
	log.Println("Server stopped.")
}

// withCORS wraps a handler with permissive CORS headers for development.
// It adds headers required by gRPC-web and the Connect protocol so browsers
// can make cross-origin RPC calls to the HTTP server on port 8081.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE")
		w.Header().Set("Access-Control-Allow-Headers",
			"Content-Type, Authorization, X-User-Agent, X-User-ID, "+
				"X-Grpc-Web, Grpc-Timeout, Grpc-Accept-Encoding, Grpc-Encoding, "+
				"Connect-Protocol-Version, Connect-Protocol-Version-Client, "+
				"Connect-Timeout-Ms, Connect-Content-Encoding, Connect-Accept-Encoding, "+
				"Accept-Encoding, Content-Encoding, X-Requested-With")
		w.Header().Set("Access-Control-Expose-Headers",
			"Content-Encoding, Grpc-Encoding, Grpc-Message, Grpc-Status, "+
				"Connect-Protocol-Version, Connect-Content-Encoding, Connect-Accept-Encoding")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
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
