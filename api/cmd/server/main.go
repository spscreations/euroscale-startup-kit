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
	"sync"
	"syscall"
	"time"

	"github.com/google/uuid"
	"golang.org/x/time/rate"
	"connectrpc.com/connect"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/grpclog"
	"google.golang.org/grpc/reflection"
	"google.golang.org/grpc/status"

	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/rest"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/spscreations/euroscale-startup-kit/api/internal/auth"
	connectpkg "github.com/spscreations/euroscale-startup-kit/api/internal/connect"
	"github.com/spscreations/euroscale-startup-kit/api/internal/ipwhitelist"
	metasvc "github.com/spscreations/euroscale-startup-kit/api/internal/metadata"
	"github.com/spscreations/euroscale-startup-kit/api/internal/models"
	molliepkg "github.com/spscreations/euroscale-startup-kit/api/internal/mollie"
	"github.com/spscreations/euroscale-startup-kit/api/internal/pitr"
	"github.com/spscreations/euroscale-startup-kit/api/internal/secrets"
	"github.com/spscreations/euroscale-startup-kit/api/internal/storage"
	"github.com/spscreations/euroscale-startup-kit/api/internal/tiers"
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

	vtgate    *vitess.Manager
	secrets   *secrets.Store
	ipwl      *ipwhitelist.Store
	tierStore *tiers.Store
	resizer   *storage.Resizer

	host     string
	sslCAPem string

	// jwtSecret is the signing key for JWT tokens.
	jwtSecret string
	// userStore holds the in-memory user registry (for login/signup).
	userStore *auth.UserStore

	// mollieHTTPHandler handles Mollie payment endpoints (create-payment, webhook, invoices).
	mollieHTTPHandler *molliepkg.Handler

	// pitrHandler manages Point-In-Time Recovery backups and restores.
	pitrHandler *pitr.Handler

	// clientset is the K8s clientset for direct Secret/ConfigMap operations.
	clientset *kubernetes.Clientset
}

// ── Authorization helpers ─────────────────────────────────────────────────

// authenticatedUserID extracts the user ID from the request context.
// Returns an error if the user is not authenticated.
func authenticatedUserID(ctx context.Context) (string, error) {
	userID := auth.GetUserID(ctx)
	if userID == "" {
		return "", status.Error(codes.Unauthenticated, "authentication required")
	}
	return userID, nil
}

// verifyDatabaseOwnership checks that the authenticated user owns the
// database identified by dbID. Returns a gRPC error if not.
func (s *server) verifyDatabaseOwnership(ctx context.Context, dbID string) error {
	ownerID := s.secrets.GetUserID(ctx, dbID)
	if ownerID == "" {
		return status.Errorf(codes.NotFound, "database not found")
	}

	userID, err := authenticatedUserID(ctx)
	if err != nil {
		return err
	}

	if ownerID != userID {
		return status.Error(codes.PermissionDenied, "access denied")
	}

	return nil
}

// ── gRPC method implementations ────────────────────────────────────────────

// CreateDatabase provisions a new Vitess database.
func (s *server) CreateDatabase(ctx context.Context, req *pb.CreateDatabaseRequest) (*pb.CreateDatabaseResponse, error) {
	// Extract the authenticated user ID from context.
	userID, err := authenticatedUserID(ctx)
	if err != nil {
		return nil, err
	}

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

	// Tier enforcement: check database count limit.
	tier := s.tierStore.GetTierForUser(ctx, userID)
	usage, err := s.tierStore.GetCurrentUsage(ctx, userID)
	if err != nil {
		log.Printf("ERROR: failed to get usage for user %q: %v", userID, err)
		return nil, status.Error(codes.Internal, "failed to check tier usage")
	}
	if tier.MaxDatabases != tiers.UnlimitedDBs && int(usage.DatabaseCount) >= tier.MaxDatabases {
		return nil, status.Errorf(codes.ResourceExhausted,
			"database limit reached (%d) for tier %q — upgrade at euroscale.app",
			tier.MaxDatabases, tier.Name)
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
		return nil, status.Error(codes.Internal, "failed to create database")
	}

	// Generate credentials.
	username, password, err := vitess.GenerateCredentials()
	if err != nil {
		log.Printf("ERROR: failed to generate credentials for %q: %v", dbID, err)
		// Best-effort cleanup of the created database.
		_ = s.vtgate.DeleteDatabase(context.Background(), dbName)
		return nil, status.Error(codes.Internal, "failed to generate credentials")
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
		UserID:    userID,
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
		return nil, status.Error(codes.Internal, "failed to store credentials")
	}

	// New databases get storage managed by the Vitess operator via VitessShard CRD.
	// No tracking PVC is created — actual storage is the vttablet PVCs.

	// Increment the database count for tier tracking.
	if err := s.tierStore.IncrementDatabaseCount(ctx, userID); err != nil {
		log.Printf("ERROR: failed to increment database count for user %q: %v", userID, err)
		// Non-fatal — the database was created, just logging is fine.
	}

	log.Printf("INFO: created database %q (id=%s, user=%s, region=%s)", dbName, dbID, userID, region)

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

	// Verify the authenticated user owns this database.
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
	}

	// Retrieve credentials to find the database name.
	creds, err := s.secrets.GetCredentials(ctx, req.DatabaseId)
	if err != nil {
		log.Printf("ERROR: failed to get credentials for %q: %v", req.DatabaseId, err)
		return nil, status.Error(codes.NotFound, "database not found")
	}

	// Drop the database in Vitess.
	if err := s.vtgate.DeleteDatabase(ctx, extractDBName(creds.ConnectionString)); err != nil {
		log.Printf("ERROR: failed to drop vitess database for %q: %v", req.DatabaseId, err)
		return nil, status.Error(codes.Internal, "failed to delete database")
	}

	// Delete the K8s Secret.
	if err := s.secrets.DeleteCredentials(ctx, req.DatabaseId); err != nil {
		log.Printf("ERROR: failed to delete credentials for %q: %v", req.DatabaseId, err)
		// Database is already dropped — still return success.
	}

	// Decrement the database count for tier tracking.
	// Get user ID from context for the usage update.
	userID, _ := authenticatedUserID(ctx)
	if userID != "" {
		if err := s.tierStore.DecrementDatabaseCount(ctx, userID); err != nil {
			log.Printf("ERROR: failed to decrement database count for user %q: %v", userID, err)
		}
	}

	log.Printf("INFO: deleted database %q", req.DatabaseId)

	return &pb.DeleteDatabaseResponse{
		Success: true,
		Message: fmt.Sprintf("database %q deleted successfully", req.DatabaseId),
	}, nil
}

// ListDatabases returns all databases owned by a user.
func (s *server) ListDatabases(ctx context.Context, req *pb.ListDatabasesRequest) (*pb.ListDatabasesResponse, error) {
	userID, err := authenticatedUserID(ctx)
	if err != nil {
		return nil, err
	}

	// List all euroscale-managed databases from K8s Secrets.
	allDBs, err := s.secrets.ListAll(ctx)
	if err != nil {
		log.Printf("ERROR: failed to list databases: %v", err)
		return nil, status.Error(codes.Internal, "failed to list databases")
	}

	pageSize := int(req.PageSize)
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 50
	}

	// Filter by user_id.
	databases := make([]*pb.Database, 0)
	for _, db := range allDBs {
		if db.UserID != userID {
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

	// Verify the authenticated user owns this database.
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
	}

	creds, err := s.secrets.GetCredentials(ctx, req.DatabaseId)
	if err != nil {
		return nil, status.Error(codes.NotFound, "database not found")
	}

	dbEntry := &pb.Database{
		DatabaseId: creds.DatabaseID,
		Name:       extractDBName(creds.ConnectionString),
		Engine:     models.EngineMySQL,
		Host:       s.host,
		Port:       3306,
		Username:   creds.Username,
		Status:     models.StatusReady,
		SslCaPem:   s.sslCAPem,
	}

	// Populate createdAt from the secret annotation.
	if ann := s.secrets.GetAnnotations(ctx, req.DatabaseId); ann != nil {
		if ts, ok := ann["euroscale.app/created-at"]; ok {
			if t, err := time.Parse(time.RFC3339, ts); err == nil {
				dbEntry.CreatedAt = t.Format(time.RFC3339)
			}
		}
	}

	return &pb.GetDatabaseResponse{
		Database: dbEntry,
	}, nil
}

// RotateCredentials generates new credentials and updates the K8s Secret.
func (s *server) RotateCredentials(ctx context.Context, req *pb.RotateCredentialsRequest) (*pb.RotateCredentialsResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}

	// Verify the authenticated user owns this database.
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
	}

	// Retrieve existing credentials to find the database name.
	existing, err := s.secrets.GetCredentials(ctx, req.DatabaseId)
	if err != nil {
		return nil, status.Error(codes.NotFound, "database not found")
	}

	dbName := extractDBName(existing.ConnectionString)

	// Generate new credentials.
	username, password, err := vitess.GenerateCredentials()
	if err != nil {
		log.Printf("ERROR: failed to generate credentials for %q: %v", req.DatabaseId, err)
		return nil, status.Error(codes.Internal, "failed to generate credentials")
	}

	// Build new connection string.
	connStr := fmt.Sprintf("mysql://%s:***@%s:3306/%s?ssl-mode=%s",
		username, s.host, dbName, sslMode)

	// Preserve ownership from the existing secret so UpdateCredentials does
	// not wipe the user_id label (empty UserID would clear ownership).
	ownerID := s.secrets.GetUserID(ctx, req.DatabaseId)

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
		UserID:    ownerID,
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
		log.Printf("ERROR: failed to update credentials for %q: %v", req.DatabaseId, err)
		return nil, status.Error(codes.Internal, "failed to update credentials")
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

	// Verify the authenticated user owns this database.
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
	}

	entries, err := s.secrets.GetIPWhitelist(ctx, req.DatabaseId)
	if err != nil {
		log.Printf("ERROR: failed to get IP whitelist for %q: %v", req.DatabaseId, err)
		return nil, status.Error(codes.Internal, "failed to get IP whitelist")
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

	// Verify the authenticated user owns this database.
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
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

	// Verify the authenticated user owns this database.
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
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

	log.Printf("INFO: removed CIDR %q from whitelist for database %q", req.Cidr, req.DatabaseId)

	return &pb.RemoveIPWhitelistEntryResponse{
		Success: true,
		Message: fmt.Sprintf("CIDR %q removed from whitelist", req.Cidr),
	}, nil
}

// ── Tier & Usage RPCs ────────────────────────────────────────────────────────

// GetUsage returns the current usage and tier limits for a user.
func (s *server) GetUsage(ctx context.Context, req *pb.GetUsageRequest) (*pb.GetUsageResponse, error) {
	userID, err := authenticatedUserID(ctx)
	if err != nil {
		return nil, err
	}

	tier := s.tierStore.GetTierForUser(ctx, userID)
	usage, err := s.tierStore.GetCurrentUsage(ctx, userID)
	if err != nil {
		log.Printf("ERROR: failed to get usage for user %q: %v", userID, err)
		return nil, status.Error(codes.Internal, "failed to get usage")
	}

	// Source of truth for database count: owned K8s database secrets.
	// Usage secret can drift after auth-db re-labels or manual secret fixes.
	allDBs, err := s.secrets.ListAll(ctx)
	if err != nil {
		log.Printf("WARN: failed to list databases for usage reconcile (user %q): %v", userID, err)
	} else {
		var owned int32
		for _, db := range allDBs {
			if db.UserID == userID {
				owned++
			}
		}
		if usage.DatabaseCount != owned {
			log.Printf("INFO: reconciling usage database_count for user %q: stored=%d actual=%d", userID, usage.DatabaseCount, owned)
			// Best-effort write-back so counters stay consistent for create/delete paths.
			if err := s.tierStore.SetDatabaseCount(ctx, userID, owned); err != nil {
				log.Printf("WARN: failed to write back reconciled database_count for user %q: %v", userID, err)
			}
			usage.DatabaseCount = owned
		}
	}

	limits := &pb.TierLimits{
		MaxDatabases:              int32(tier.MaxDatabases),
		MaxStorageBytes:           tier.MaxStorageGB * 1_073_741_824, // GB to bytes
		ReadUnitsPerMonth:         tier.ReadUnitsPerMonth,
		WriteUnitsPerMonth:        tier.WriteUnitsPerMonth,
		AdditionalStorageGbPrice:  tier.AdditionalStorageGBPrice,
		AutoscaleCuPrice:          tier.AutoscaleCUPrice,
		AutoscaleMaxCu:            tier.AutoscaleMaxCU,
	}

	// Source of truth for storage: actual vttablet PVC sizes from the
	// Vitess operator (not the stale usage-tracking secret).
	if realStorageBytes, err := s.resizer.GetTotalStorageBytes(ctx); err != nil {
		log.Printf("WARN: failed to read real storage from vttablet PVCs: %v", err)
	} else {
		usage.StorageBytes = realStorageBytes
	}

	return &pb.GetUsageResponse{
		UserId: userID,
		Tier:   tier.Name,
		Limits: limits,
		Usage: &pb.Usage{
			DatabaseCount: usage.DatabaseCount,
			StorageBytes:  usage.StorageBytes,
			ReadUnitsUsed: usage.ReadUnits,
			WriteUnitsUsed: usage.WriteUnits,
		},
	}, nil
}

// SetUserTier updates the subscription tier for a user (admin only — gated
// by the role claim in the JWT). The target user ID is passed in the request
// (only allowed for admin users) or defaults to the authenticated user.
func (s *server) SetUserTier(ctx context.Context, req *pb.SetUserTierRequest) (*pb.SetUserTierResponse, error) {
	role := auth.GetUserRole(ctx)
	if role != "admin" {
		return nil, status.Error(codes.PermissionDenied, "admin access required")
	}

	if req.UserId == "" {
		return nil, status.Error(codes.InvalidArgument, "user_id is required")
	}
	if req.Tier == "" {
		return nil, status.Error(codes.InvalidArgument, "tier is required")
	}

	if err := s.tierStore.SetUserTier(ctx, req.UserId, req.Tier); err != nil {
		log.Printf("ERROR: failed to set tier %q for user %q: %v", req.Tier, req.UserId, err)
		return nil, status.Errorf(codes.InvalidArgument, "invalid tier")
	}

	log.Printf("INFO: set tier %q for user %q", req.Tier, req.UserId)

	return &pb.SetUserTierResponse{
		Success: true,
	}, nil
}

// ResizeStorage expands a database's PVC by the specified GB amount.
func (s *server) ResizeStorage(ctx context.Context, req *pb.ResizeStorageRequest) (*pb.ResizeStorageResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}
	if req.AdditionalGb <= 0 {
		return nil, status.Error(codes.InvalidArgument, "additional_gb must be positive")
	}

	// Verify the authenticated user owns this database.
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
	}

	// ── Tier limit enforcement ────────────────────────────────────
	userID := auth.GetUserID(ctx)
	if userID != "" {
		tier := s.tierStore.GetTierForUser(ctx, userID)
		currentGB, _ := s.resizer.GetCurrentStorage(ctx, req.DatabaseId)
		requestedTotal := currentGB + int64(req.AdditionalGb)
		if tier.MaxStorageGB != tiers.UnlimitedDBs && requestedTotal > tier.MaxStorageGB {
			return &pb.ResizeStorageResponse{
				Success: false,
				Message: fmt.Sprintf(
					"storage limit reached: your %s plan allows %d GB (current: %d GB, requested: %d GB). Upgrade at euroscale.app/billing",
					tier.Name, tier.MaxStorageGB, currentGB, requestedTotal,
				),
			}, nil
		}
	}

	newTotalGB, err := s.resizer.ResizeStorage(ctx, req.DatabaseId, req.AdditionalGb)
	if err != nil {
		log.Printf("ERROR: failed to resize PVC for database %q: %v", req.DatabaseId, err)
		return &pb.ResizeStorageResponse{
			Success: false,
			Message: fmt.Sprintf("resize failed: %v", err),
		}, nil
	}

	log.Printf("INFO: resized storage for database %q by %d GB (new total: %d GB)",
		req.DatabaseId, req.AdditionalGb, newTotalGB)

	return &pb.ResizeStorageResponse{
		Success:     true,
		NewTotalGb:  newTotalGB,
		Message:     fmt.Sprintf("PVC resized from %d GB to %d GB", newTotalGB-int64(req.AdditionalGb), newTotalGB),
	}, nil
}

// ── Autoscale settings ──────────────────────────────────────────────────────

// autoscaleSettings is the JSON shape for autoscale configuration stored
// in K8s Secrets named "autoscale-{databaseID}".
type autoscaleSettings struct {
	Enabled          bool `json:"enabled"`
	ThresholdPercent int32 `json:"threshold_percent"`
	IncrementPercent int32 `json:"increment_percent"`
}

const (
	defaultAutoscaleThreshold = 80
	defaultAutoscaleIncrement = 20
)

// autoscaleSecretName returns the deterministic autoscale Secret name.
func autoscaleSecretName(databaseID string) string {
	return fmt.Sprintf("autoscale-%s", databaseID)
}

// saveAutoscaleSettings stores autoscale configuration as a K8s Secret.
func (s *server) saveAutoscaleSettings(ctx context.Context, databaseID string, cfg *autoscaleSettings) error {
	cfgJSON, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to marshal autoscale settings: %w", err)
	}

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      autoscaleSecretName(databaseID),
			Namespace: "euroscale",
			Labels: map[string]string{
				"app":      "euroscale",
				"type":     "autoscale",
				"database": databaseID,
			},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"autoscale.json": cfgJSON,
		},
	}

	// Try to update first; if not found, create.
	_, err = s.clientset.CoreV1().Secrets("euroscale").Update(ctx, secret, metav1.UpdateOptions{})
	if err != nil {
		// If update fails (e.g., not found), try creating.
		_, err = s.clientset.CoreV1().Secrets("euroscale").Create(ctx, secret, metav1.CreateOptions{})
		if err != nil {
			return fmt.Errorf("failed to create/update autoscale secret: %w", err)
		}
	}

	return nil
}

// getAutoscaleSettings reads autoscale configuration from a K8s Secret.
func (s *server) getAutoscaleSettings(ctx context.Context, databaseID string) (*autoscaleSettings, error) {
	secret, err := s.clientset.CoreV1().Secrets("euroscale").Get(ctx, autoscaleSecretName(databaseID), metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("autoscale settings not found for %q", databaseID)
	}

	cfgJSON, ok := secret.Data["autoscale.json"]
	if !ok {
		return nil, fmt.Errorf("autoscale settings malformed for %q", databaseID)
	}

	var cfg autoscaleSettings
	if err := json.Unmarshal(cfgJSON, &cfg); err != nil {
		return nil, fmt.Errorf("failed to unmarshal autoscale settings for %q: %w", databaseID, err)
	}

	return &cfg, nil
}

// ── SetAutoscale & GetMetrics gRPC handlers ─────────────────────────────────

// SetAutoscale enables/disables automatic storage scaling for a database.
func (s *server) SetAutoscale(ctx context.Context, req *pb.SetAutoscaleRequest) (*pb.SetAutoscaleResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
	}

	cfg := &autoscaleSettings{
		Enabled:          req.Enabled,
		ThresholdPercent: req.ThresholdPercent,
		IncrementPercent: req.IncrementPercent,
	}
	if cfg.ThresholdPercent <= 0 {
		cfg.ThresholdPercent = defaultAutoscaleThreshold
	}
	if cfg.IncrementPercent <= 0 {
		cfg.IncrementPercent = defaultAutoscaleIncrement
	}

	if err := s.saveAutoscaleSettings(ctx, req.DatabaseId, cfg); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to save autoscale settings: %v", err)
	}

	log.Printf("INFO: autoscale %s for database %q (threshold=%d%%, increment=%d%%)",
		map[bool]string{true: "enabled", false: "disabled"}[cfg.Enabled],
		req.DatabaseId, cfg.ThresholdPercent, cfg.IncrementPercent)

	return &pb.SetAutoscaleResponse{
		Enabled:          cfg.Enabled,
		ThresholdPercent: cfg.ThresholdPercent,
		IncrementPercent: cfg.IncrementPercent,
	}, nil
}

// GetMetrics returns CPU and disk usage metrics for a database (last 24h).
func (s *server) GetMetrics(ctx context.Context, req *pb.GetMetricsRequest) (*pb.GetMetricsResponse, error) {
	if req.DatabaseId == "" {
		return nil, status.Error(codes.InvalidArgument, "database_id is required")
	}
	if err := s.verifyDatabaseOwnership(ctx, req.DatabaseId); err != nil {
		return nil, err
	}

	points, err := s.readMetrics(ctx, req.DatabaseId)
	if err != nil {
		log.Printf("WARN: metrics read error for %q: %v", req.DatabaseId, err)
		return &pb.GetMetricsResponse{Points: nil}, nil
	}

	pbPoints := make([]*pb.MetricPoint, 0, len(points))
	for _, p := range points {
		pbPoints = append(pbPoints, &pb.MetricPoint{
			Timestamp:  p.Timestamp,
			CpuPercent: p.CPUPercent,
			DiskGb:     p.DiskGB,
		})
	}
	return &pb.GetMetricsResponse{Points: pbPoints}, nil
}

// listAutoscaleSecrets lists all K8s Secrets with the autoscale type label.
func (s *server) listAutoscaleSecrets(ctx context.Context) ([]string, error) {
	secrets, err := s.clientset.CoreV1().Secrets("euroscale").List(ctx, metav1.ListOptions{
		LabelSelector: "app=euroscale,type=autoscale",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list autoscale secrets: %w", err)
	}

	var dbIDs []string
	for _, secret := range secrets.Items {
		if dbID := secret.Labels["database"]; dbID != "" {
			dbIDs = append(dbIDs, dbID)
		}
	}
	return dbIDs, nil
}

// handleAutoscale handles GET and POST for /api/v1/databases/{id}/autoscale
func (s *server) handleAutoscale(w http.ResponseWriter, r *http.Request) {
	userID, err := s.authenticateHTTPRequest(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": err.Error()})
		return
	}

	// Extract database ID from path: /api/v1/databases/{id}/autoscale
	pathParts := strings.Split(strings.TrimSuffix(r.URL.Path, "/"), "/")
	if len(pathParts) < 5 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid path"})
		return
	}
	databaseID := pathParts[4]

	// Verify ownership.
	if !s.userOwnsDatabase(r.Context(), userID, databaseID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "access denied"})
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := s.getAutoscaleSettings(r.Context(), databaseID)
		if err != nil {
			// If not configured, return defaults.
			writeJSON(w, http.StatusOK, autoscaleSettings{
				Enabled:          false,
				ThresholdPercent: defaultAutoscaleThreshold,
				IncrementPercent: defaultAutoscaleIncrement,
			})
			return
		}
		writeJSON(w, http.StatusOK, cfg)

	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, 4<<10) // 4KB limit

		var req autoscaleSettings
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
			return
		}

		// Apply defaults.
		if req.ThresholdPercent <= 0 {
			req.ThresholdPercent = defaultAutoscaleThreshold
		}
		if req.IncrementPercent <= 0 {
			req.IncrementPercent = defaultAutoscaleIncrement
		}

		if err := s.saveAutoscaleSettings(r.Context(), databaseID, &req); err != nil {
			log.Printf("ERROR: failed to save autoscale settings for %q: %v", databaseID, err)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "failed to save autoscale settings"})
			return
		}

		log.Printf("INFO: saved autoscale settings for database %q (enabled=%v, threshold=%d%%, increment=%d%%)",
			databaseID, req.Enabled, req.ThresholdPercent, req.IncrementPercent)

		writeJSON(w, http.StatusOK, req)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// userOwnsDatabase checks whether a user owns the given database.
func (s *server) userOwnsDatabase(ctx context.Context, userID, databaseID string) bool {
	ownerID := s.secrets.GetUserID(ctx, databaseID)
	return ownerID != "" && ownerID == userID
}

// ── Metrics ─────────────────────────────────────────────────────────────────

// metricPoint represents a single data point for CPU and disk usage.
type metricPoint struct {
	Timestamp int64   `json:"ts"`
	CPUPercent float64 `json:"cpu_pct"`
	DiskGB    float64 `json:"disk_gb"`
}

// metricsConfigMapName returns the deterministic ConfigMap name for metrics data.
func metricsConfigMapName(databaseID string) string {
	return fmt.Sprintf("metrics-%s", databaseID)
}

const maxMetricPoints = 288 // 24h * 12/hr

// handleMetrics handles GET for /api/v1/databases/{id}/metrics
func (s *server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := s.authenticateHTTPRequest(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": err.Error()})
		return
	}

	// Extract database ID from path: /api/v1/databases/{id}/metrics
	pathParts := strings.Split(strings.TrimSuffix(r.URL.Path, "/"), "/")
	if len(pathParts) < 5 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid path"})
		return
	}
	databaseID := pathParts[4]

	// Verify ownership.
	if !s.userOwnsDatabase(r.Context(), userID, databaseID) {
		writeJSON(w, http.StatusForbidden, map[string]string{"message": "access denied"})
		return
	}

	// Read metrics from ConfigMap.
	points, err := s.readMetrics(r.Context(), databaseID)
	if err != nil {
		log.Printf("WARN: failed to read metrics for %q: %v", databaseID, err)
		// Return empty points on error.
		writeJSON(w, http.StatusOK, map[string]interface{}{"points": []metricPoint{}})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"points": points})
}

// readMetrics reads the metrics data from the ConfigMap for a database.
func (s *server) readMetrics(ctx context.Context, databaseID string) ([]metricPoint, error) {
	cm, err := s.clientset.CoreV1().ConfigMaps("euroscale").Get(ctx, metricsConfigMapName(databaseID), metav1.GetOptions{})
	if err != nil {
		return nil, fmt.Errorf("metrics ConfigMap not found for %q", databaseID)
	}

	dataJSON, ok := cm.BinaryData["metrics.json"]
	if !ok {
		// Check regular data field too.
		if dataStr, ok2 := cm.Data["metrics.json"]; ok2 {
			dataJSON = []byte(dataStr)
		} else {
			return []metricPoint{}, nil
		}
	}

	var points []metricPoint
	if err := json.Unmarshal(dataJSON, &points); err != nil {
		return nil, fmt.Errorf("failed to unmarshal metrics for %q: %w", databaseID, err)
	}

	return points, nil
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

// authHandler handles login and signup with real password validation and
// per-user JWT token generation. The JWT is valid for 24 hours.
func (s *server) authHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Limit request body to 8KB (login/signup payloads are small).
	r.Body = http.MaxBytesReader(w, r.Body, 8<<10)

	var (
		email    string
		password string
		name     string
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
		password = req.Password
	case strings.HasSuffix(r.URL.Path, "/signup"):
		var req signupRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid request body"})
			return
		}
		email = req.Email
		password = req.Password
		name = req.Name
	default:
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if email == "" || password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "email and password are required"})
		return
	}

	var user *auth.User

	// Signup path: create a new user.
	if strings.HasSuffix(r.URL.Path, "/signup") {
		if name == "" {
			name = email // default name to email prefix
		}
		var err error
		user, err = s.userStore.CreateUser(email, name, password, "user")
		if err != nil {
			log.Printf("ERROR: signup failed for %q: %v", email, err)
			writeJSON(w, http.StatusConflict, map[string]string{"message": "a user with this email already exists"})
			return
		}
		log.Printf("INFO: new user signed up: %s <%s>", user.ID, user.Email)
	} else {
		// Login path: authenticate existing user.
		var err error
		user, err = s.userStore.Authenticate(email, password)
		if err != nil {
			log.Printf("WARNING: login failed for %q: %v", email, err)
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "invalid email or password"})
			return
		}
		log.Printf("INFO: user logged in: %s <%s>", user.ID, user.Email)
	}

	// Generate JWT (valid for 24 hours).
	token, err := auth.GenerateJWT(user.ID, user.Email, user.Role, s.jwtSecret, 24*time.Hour)
	if err != nil {
		log.Printf("ERROR: failed to generate JWT for %q: %v", user.ID, err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"message": "failed to generate token"})
		return
	}

	resp := authResponse{
		User: authUser{
			ID:    user.ID,
			Name:  user.Name,
			Email: user.Email,
		},
		Token:            token,
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
// for per-user IP whitelists. The authenticated user ID is extracted from the
// JWT token in the Authorization header.
func (s *server) ipWhitelistHandler(w http.ResponseWriter, r *http.Request) {
	// Extract and validate JWT from the Authorization header.
	userID, err := s.authenticateHTTPRequest(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"message": err.Error()})
		return
	}

	// Limit request body to 4KB for POST/DELETE (IP entries are tiny).
	if r.Method == http.MethodPost || r.Method == http.MethodDelete {
		r.Body = http.MaxBytesReader(w, r.Body, 4<<10)
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "invalid IP address or format"})
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
		writeJSON(w, http.StatusBadRequest, map[string]string{"message": "IP not found"})
		return
	}

	log.Printf("INFO: removed IP %q from whitelist for user %q", req.IP, userID)

	// Return the updated list.
	s.handleListIPs(w, r, userID)
}

// authenticateHTTPRequest extracts and validates a JWT Bearer token from the
// Authorization header of an HTTP request. Returns the authenticated user ID.
func (s *server) authenticateHTTPRequest(r *http.Request) (string, error) {
	// Validate JWT Bearer token from Authorization header.
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return "", fmt.Errorf("missing Authorization header")
	}
	tokenStr, ok := strings.CutPrefix(authHeader, "Bearer ")
	if !ok {
		return "", fmt.Errorf("invalid Authorization header format")
	}
	userID, _, _, err := auth.ValidateJWT(tokenStr, s.jwtSecret)
	if err != nil {
		return "", fmt.Errorf("invalid token")
	}
	return userID, nil
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
// If no whitelist is configured for the user, the check is skipped (allow all).
// If a whitelist exists, only listed IPs are allowed.
func ipWhitelistInterceptor(store *ipwhitelist.Store) connect.UnaryInterceptorFunc {
	interceptor := func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			userID := req.Header().Get("X-User-ID")
			if userID == "" {
				// If no user ID header, skip IP check (auth endpoint calls).
				return next(ctx, req)
			}

			// Only enforce if the user has explicitly configured a whitelist.
			if !store.HasWhitelist(ctx, userID) {
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

// ── Auth interceptor (JWT-based) ──────────────────────────────────────────

// authInterceptor validates JWT Bearer tokens and injects the authenticated
// user ID into the gRPC context using the auth package's JWTUnaryInterceptor.
func authInterceptor(jwtSecret string) grpc.UnaryServerInterceptor {
	return auth.JWTUnaryInterceptor(jwtSecret)
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

	// JWT secret for token signing and validation.
	// BETTER_AUTH_SECRET is the shared secret with Better Auth (dashboard).
	// This ensures JWTs issued by Better Auth can be validated by the API.
	jwtSecret := os.Getenv("BETTER_AUTH_SECRET")
	if jwtSecret == "" {
		jwtSecret = os.Getenv("JWT_SECRET")
	}
	if jwtSecret == "" {
		jwtSecret = os.Getenv("EUROSCALE_API_KEY")
	}
	if jwtSecret == "" {
		log.Fatal("BETTER_AUTH_SECRET (or JWT_SECRET, or EUROSCALE_API_KEY) environment variable is required")
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

	dynamicClient, err := dynamic.NewForConfig(config)
	if err != nil {
		log.Fatalf("Failed to create dynamic K8s client: %v", err)
	}

	secretsStore := secrets.NewStore(clientset, namespace)
	ipwlStore := ipwhitelist.NewStore(clientset, namespace)
	tierStore := tiers.NewStore(clientset, namespace)
	resizer := storage.NewResizer(clientset, dynamicClient, namespace)
	log.Println("K8s clientset created successfully.")

	// Ensure the user-tier ConfigMap exists.
	if err := tierStore.EnsureConfigMap(context.Background()); err != nil {
		log.Fatalf("Failed to ensure euroscale-user-tiers ConfigMap: %v", err)
	}
	log.Println("Tier store initialized successfully.")

	// ── Initialize Mollie handler ──────────────────────────────────────────
	var mollieHTTPHandler *molliepkg.Handler
	mollieAPIKey := os.Getenv("MOLLIE_API_KEY")
	mollieWebhookSecret := os.Getenv("MOLLIE_WEBHOOK_SECRET")
	if mollieWebhookSecret == "" && mollieAPIKey != "" {
		log.Println("WARNING: MOLLIE_WEBHOOK_SECRET not set — webhook signature verification disabled")
		log.Println("         Set MOLLIE_WEBHOOK_SECRET to the webhook secret from Mollie dashboard to enable verification.")
	}
	if mollieAPIKey != "" {
		baseURL := os.Getenv("MOLLIE_BASE_URL")
		if baseURL == "" {
			baseURL = "https://api.mollie.com"
		}
		mollieClient, err := molliepkg.NewClient(molliepkg.MollieConfig{
			APIKey:  mollieAPIKey,
			BaseURL: baseURL,
		})
		if err != nil {
			log.Printf("WARNING: failed to initialize Mollie client: %v", err)
		} else {
			mollieHTTPHandler = molliepkg.NewHandler(mollieClient, tierStore, mollieWebhookSecret)
			log.Println("Mollie payment handler initialized.")
		}
	} else {
		log.Println("WARNING: MOLLIE_API_KEY not set — payment features disabled")
	}

	// ── Load SSL CA certificate ───────────────────────────────────────────
	sslCAPem := loadSSLCert()

	// ── Initialize user store ──────────────────────────────────────────────
	userStore := auth.NewUserStore()
	log.Println("User store initialized.")

	// Seed default admin user if configured via env vars.
	adminEmail := os.Getenv("ADMIN_EMAIL")
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminEmail != "" && adminPassword != "" {
		if !userStore.HasUser() {
			if _, err := userStore.CreateUser(adminEmail, "Admin", adminPassword, "admin"); err != nil {
				log.Printf("WARNING: failed to seed admin user: %v", err)
			} else {
				log.Printf("INFO: seeded admin user %q", adminEmail)
			}
		}
	}

	// ── Build the gRPC server ───────────────────────────────────────────────
	// Initialize the PITR handler for backup/restore operations.
	pitrHandler := pitr.NewHandler(clientset, dynamicClient, vtctldAddr, namespace)

	srv := &server{
		vtgate:    vtgateMgr,
		secrets:   secretsStore,
		ipwl:      ipwlStore,
		tierStore: tierStore,
		resizer:   resizer,
		host:      host,
		sslCAPem:  sslCAPem,
		jwtSecret:        jwtSecret,
		userStore:        userStore,
		mollieHTTPHandler: mollieHTTPHandler,
		pitrHandler:       pitrHandler,
		clientset:         clientset,
	}

	grpcServer := grpc.NewServer(
		grpc.UnaryInterceptor(authInterceptor(jwtSecret)),
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

	// Mollie payment endpoints (require JWT auth except webhook which uses signature verification).
	if mollieHTTPHandler != nil {
		httpMux.HandleFunc("/api/v1/create-payment", withHTTPAuth(jwtSecret, mollieHTTPHandler.HandleCreatePayment))
		httpMux.HandleFunc("/api/v1/mollie-webhook", mollieHTTPHandler.HandleWebhook)
		httpMux.HandleFunc("/api/v1/invoices", withHTTPAuth(jwtSecret, mollieHTTPHandler.HandleListInvoices))
		httpMux.HandleFunc("/api/v1/confirm-payment", withHTTPAuth(jwtSecret, mollieHTTPHandler.HandleConfirmPayment))
		log.Println("Mollie payment handlers registered: /api/v1/create-payment, /api/v1/mollie-webhook, /api/v1/invoices, /api/v1/confirm-payment")
	} else {
		log.Println("MOLLIE_API_KEY not set — Mollie payment handlers disabled")
	}

	// PITR backup and restore endpoints (require JWT auth).
	httpMux.HandleFunc("/api/v1/backups", withHTTPAuth(jwtSecret, srv.pitrHandler.HandleListBackups))
	httpMux.HandleFunc("/api/v1/backups/", withHTTPAuth(jwtSecret, srv.pitrHandler.HandleListBackups))
	httpMux.HandleFunc("/api/v1/restore", withHTTPAuth(jwtSecret, srv.pitrHandler.HandleTriggerRestore))
	httpMux.HandleFunc("/api/v1/restore/", withHTTPAuth(jwtSecret, srv.pitrHandler.HandleTriggerRestore))
	httpMux.HandleFunc("/api/v1/restores", withHTTPAuth(jwtSecret, srv.pitrHandler.HandleRestoreStatus))
	httpMux.HandleFunc("/api/v1/restores/", withHTTPAuth(jwtSecret, srv.pitrHandler.HandleRestoreStatus))
	// POST /api/v1/backups-trigger — trigger a new backup
	httpMux.HandleFunc("/api/v1/backups-trigger", withHTTPAuth(jwtSecret, srv.pitrHandler.HandleTriggerBackup))
	// POST /api/v1/incremental-backup-trigger — trigger an incremental backup
	httpMux.HandleFunc("/api/v1/incremental-backup-trigger", withHTTPAuth(jwtSecret, srv.pitrHandler.HandleTriggerIncrementalBackup))
	log.Println("PITR endpoints registered: /api/v1/backups, /api/v1/backups-trigger, /api/v1/incremental-backup-trigger, /api/v1/restore, /api/v1/restores")

	// Autoscale and metrics endpoints (require JWT auth).
	// POST/GET /api/v1/databases/{id}/autoscale
	httpMux.HandleFunc("/api/v1/databases/", func(w http.ResponseWriter, r *http.Request) {
		// Route to the correct handler based on the path suffix.
		path := r.URL.Path
		if strings.HasSuffix(path, "/autoscale") || strings.Contains(path, "/autoscale") {
			srv.handleAutoscale(w, r)
			return
		}
		if strings.HasSuffix(path, "/metrics") || strings.Contains(path, "/metrics") {
			srv.handleMetrics(w, r)
			return
		}
		// Fallback: return 404 for unknown sub-paths.
		writeJSON(w, http.StatusNotFound, map[string]string{"message": "not found"})
	})
	log.Println("Autoscale and metrics endpoints registered: /api/v1/databases/{id}/autoscale, /api/v1/databases/{id}/metrics")

	// Build and register Connect/gRPC-web handler on the same port.
	// This makes the DatabaseService available to browsers via HTTP/1.1
	// using the Connect protocol (JSON or binary), plus gRPC-web.
	// Chain the IP whitelist interceptor after the auth interceptor.
	connectHandler := connectpkg.NewHandler(srv, jwtSecret, ipWhitelistInterceptor(ipwlStore))
	httpMux.Handle("/euroscale.v1.DatabaseService/", connectHandler)

	// Register MetadataService for schema browsing.
	metaConnectHandler := connectpkg.NewMetadataHandler(metaSvc, jwtSecret)
	httpMux.Handle("/euroscale.v1.MetadataService/", metaConnectHandler)

	// Chain middleware: CORS → rate limiting → handler.
	var httpHandler http.Handler = httpMux
	httpHandler = rateLimitMiddleware(httpHandler)
	httpHandler = withCORS(httpHandler)

	httpServer := &http.Server{
		Addr:         httpPort,
		Handler:      httpHandler,
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

// withCORS wraps a handler with CORS headers. Origin is restricted to known
// EuroScale domains; falls back to reading ALLOWED_ORIGINS from env.
func withCORS(next http.Handler) http.Handler {
	allowedOrigin := os.Getenv("ALLOWED_ORIGINS")
	if allowedOrigin == "" {
		allowedOrigin = "https://euroscale.app, https://app.euroscale.app"
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		originAllowed := false
		for _, allowed := range strings.Split(allowedOrigin, ",") {
			if strings.TrimSpace(allowed) == origin {
				originAllowed = true
				break
			}
		}
		if originAllowed || origin == "" {
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else {
				w.Header().Set("Access-Control-Allow-Origin", strings.Split(allowedOrigin, ",")[0])
			}
		}
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

// rateLimitMiddleware applies per-IP token-bucket rate limiting.
// Global limit: 100 requests/second burstable to 200.
// This runs before the handler for all HTTP requests.
var rateLimiterStore = struct {
	sync.Mutex
	limiters map[string]*rate.Limiter
}{limiters: make(map[string]*rate.Limiter)}

// withHTTPAuth wraps an http.HandlerFunc with JWT Bearer token validation.
// It extracts the token from the Authorization header, validates it, and
// injects the authenticated user ID and role into the request context
// (mirroring JWTUnaryInterceptor for gRPC). If validation fails, it returns 401.
func withHTTPAuth(jwtSecret string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Validate JWT Bearer token from Authorization header.
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "missing Authorization header"})
			return
		}
		tokenStr, ok := strings.CutPrefix(authHeader, "Bearer ")
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "invalid Authorization header format"})
			return
		}
		userID, _, role, err := auth.ValidateJWT(tokenStr, jwtSecret)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"message": "invalid token"})
			return
		}
		ctx := auth.SetUserID(r.Context(), userID)
		ctx = auth.SetUserRole(ctx, role)
		next(w, r.WithContext(ctx))
	}
}

func rateLimitMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip rate limiting for health endpoints.
		if strings.HasPrefix(r.URL.Path, "/healthz") || strings.HasPrefix(r.URL.Path, "/ready") {
			next.ServeHTTP(w, r)
			return
		}

		ip := extractClientIP(r)

		rateLimiterStore.Lock()
		limiter, exists := rateLimiterStore.limiters[ip]
		if !exists {
			// 100 req/s with burst of 200.
			limiter = rate.NewLimiter(100, 200)
			rateLimiterStore.limiters[ip] = limiter
		}
		rateLimiterStore.Unlock()

		if !limiter.Allow() {
			writeJSON(w, http.StatusTooManyRequests, map[string]string{
				"message": "rate limit exceeded — please slow down",
			})
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
