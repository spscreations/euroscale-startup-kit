// Package connect provides HTTP handlers for the EuroScale DatabaseService
// using the Connect protocol (connectrpc.com/connect). This enables web
// browsers to call gRPC services via HTTP/1.1 + JSON, avoiding the need
// for a gRPC-web proxy.
package connect

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"connectrpc.com/connect"

	"github.com/spscreations/euroscale-startup-kit/api/internal/auth"

	pb "github.com/spscreations/euroscale-startup-kit/api/gen/euroscale/v1"
)

// ── Server interface ──────────────────────────────────────────────────────────

// DatabaseServiceServer is the subset of the main server's methods that
// connect handlers delegate to. The concrete server struct in cmd/server
// implements this interface implicitly.
type DatabaseServiceServer interface {
	CreateDatabase(ctx context.Context, req *pb.CreateDatabaseRequest) (*pb.CreateDatabaseResponse, error)
	DeleteDatabase(ctx context.Context, req *pb.DeleteDatabaseRequest) (*pb.DeleteDatabaseResponse, error)
	ListDatabases(ctx context.Context, req *pb.ListDatabasesRequest) (*pb.ListDatabasesResponse, error)
	GetDatabase(ctx context.Context, req *pb.GetDatabaseRequest) (*pb.GetDatabaseResponse, error)
	RotateCredentials(ctx context.Context, req *pb.RotateCredentialsRequest) (*pb.RotateCredentialsResponse, error)
	GetIPWhitelist(ctx context.Context, req *pb.GetIPWhitelistRequest) (*pb.GetIPWhitelistResponse, error)
	AddIPWhitelistEntry(ctx context.Context, req *pb.AddIPWhitelistEntryRequest) (*pb.AddIPWhitelistEntryResponse, error)
	RemoveIPWhitelistEntry(ctx context.Context, req *pb.RemoveIPWhitelistEntryRequest) (*pb.RemoveIPWhitelistEntryResponse, error)
	GetUsage(ctx context.Context, req *pb.GetUsageRequest) (*pb.GetUsageResponse, error)
	SetUserTier(ctx context.Context, req *pb.SetUserTierRequest) (*pb.SetUserTierResponse, error)
	ResizeStorage(ctx context.Context, req *pb.ResizeStorageRequest) (*pb.ResizeStorageResponse, error)
	SetAutoscale(ctx context.Context, req *pb.SetAutoscaleRequest) (*pb.SetAutoscaleResponse, error)
	GetMetrics(ctx context.Context, req *pb.GetMetricsRequest) (*pb.GetMetricsResponse, error)
	GetSSLCertificates(ctx context.Context, req *pb.GetSSLCertificatesRequest) (*pb.GetSSLCertificatesResponse, error)
}

// MetadataServiceServer is the interface the metadata service satisfies.
type MetadataServiceServer interface {
	ListSchemaDatabases(ctx context.Context, req *pb.ListSchemaDatabasesRequest) (*pb.ListSchemaDatabasesResponse, error)
	ListTables(ctx context.Context, req *pb.ListTablesRequest) (*pb.ListTablesResponse, error)
	ListColumns(ctx context.Context, req *pb.ListColumnsRequest) (*pb.ListColumnsResponse, error)
	PreviewTable(ctx context.Context, req *pb.PreviewTableRequest) (*pb.PreviewTableResponse, error)
}

// ── RPC paths ────────────────────────────────────────────────────────────────

// These match the fully-qualified method names from the proto service definition
// and the generated gRPC code. Connect routes HTTP POSTs to these paths.
const (
	PathCreateDatabase    = "/euroscale.v1.DatabaseService/CreateDatabase"
	PathDeleteDatabase    = "/euroscale.v1.DatabaseService/DeleteDatabase"
	PathListDatabases     = "/euroscale.v1.DatabaseService/ListDatabases"
	PathGetDatabase       = "/euroscale.v1.DatabaseService/GetDatabase"
	PathRotateCredentials = "/euroscale.v1.DatabaseService/RotateCredentials"

	// IP whitelist paths.
	PathGetIPWhitelist        = "/euroscale.v1.DatabaseService/GetIPWhitelist"
	PathAddIPWhitelistEntry    = "/euroscale.v1.DatabaseService/AddIPWhitelistEntry"
	PathRemoveIPWhitelistEntry = "/euroscale.v1.DatabaseService/RemoveIPWhitelistEntry"

	// Tier & usage paths.
	PathGetUsage   = "/euroscale.v1.DatabaseService/GetUsage"
	PathSetUserTier = "/euroscale.v1.DatabaseService/SetUserTier"

	// Storage paths.
	PathResizeStorage = "/euroscale.v1.DatabaseService/ResizeStorage"
	PathSetAutoscale  = "/euroscale.v1.DatabaseService/SetAutoscale"
	PathGetMetrics    = "/euroscale.v1.DatabaseService/GetMetrics"
	PathGetSSLCertificates = "/euroscale.v1.DatabaseService/GetSSLCertificates"

	// MetadataService paths.
	PathListSchemaDatabases = "/euroscale.v1.MetadataService/ListSchemaDatabases"
	PathListTables          = "/euroscale.v1.MetadataService/ListTables"
	PathListColumns         = "/euroscale.v1.MetadataService/ListColumns"
	PathPreviewTable        = "/euroscale.v1.MetadataService/PreviewTable"
)

// ── Handler construction ─────────────────────────────────────────────────────

// NewHandler returns an http.Handler that serves all DatabaseService RPCs
// via the Connect protocol. It validates JWT Bearer tokens on every request
// and injects the authenticated user ID into the context. Additional
// interceptors (e.g., IP whitelist) are chained after auth.
func NewHandler(srv DatabaseServiceServer, jwtSecret string, extraInterceptors ...connect.Interceptor) http.Handler {
	mux := http.NewServeMux()

	authInter := jwtAuthInterceptor(jwtSecret)

	// Build the full interceptor chain: auth first, then extras.
	allInterceptors := []connect.Interceptor{authInter}
	allInterceptors = append(allInterceptors, extraInterceptors...)

	// CreateDatabase
	mux.Handle(PathCreateDatabase, connect.NewUnaryHandler(
		PathCreateDatabase,
		func(ctx context.Context, req *connect.Request[pb.CreateDatabaseRequest]) (*connect.Response[pb.CreateDatabaseResponse], error) {
			resp, err := srv.CreateDatabase(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// DeleteDatabase
	mux.Handle(PathDeleteDatabase, connect.NewUnaryHandler(
		PathDeleteDatabase,
		func(ctx context.Context, req *connect.Request[pb.DeleteDatabaseRequest]) (*connect.Response[pb.DeleteDatabaseResponse], error) {
			resp, err := srv.DeleteDatabase(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// ListDatabases
	mux.Handle(PathListDatabases, connect.NewUnaryHandler(
		PathListDatabases,
		func(ctx context.Context, req *connect.Request[pb.ListDatabasesRequest]) (*connect.Response[pb.ListDatabasesResponse], error) {
			resp, err := srv.ListDatabases(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// GetDatabase
	mux.Handle(PathGetDatabase, connect.NewUnaryHandler(
		PathGetDatabase,
		func(ctx context.Context, req *connect.Request[pb.GetDatabaseRequest]) (*connect.Response[pb.GetDatabaseResponse], error) {
			resp, err := srv.GetDatabase(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// RotateCredentials
	mux.Handle(PathRotateCredentials, connect.NewUnaryHandler(
		PathRotateCredentials,
		func(ctx context.Context, req *connect.Request[pb.RotateCredentialsRequest]) (*connect.Response[pb.RotateCredentialsResponse], error) {
			resp, err := srv.RotateCredentials(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// GetIPWhitelist
	mux.Handle(PathGetIPWhitelist, connect.NewUnaryHandler(
		PathGetIPWhitelist,
		func(ctx context.Context, req *connect.Request[pb.GetIPWhitelistRequest]) (*connect.Response[pb.GetIPWhitelistResponse], error) {
			resp, err := srv.GetIPWhitelist(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// AddIPWhitelistEntry
	mux.Handle(PathAddIPWhitelistEntry, connect.NewUnaryHandler(
		PathAddIPWhitelistEntry,
		func(ctx context.Context, req *connect.Request[pb.AddIPWhitelistEntryRequest]) (*connect.Response[pb.AddIPWhitelistEntryResponse], error) {
			resp, err := srv.AddIPWhitelistEntry(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// RemoveIPWhitelistEntry
	mux.Handle(PathRemoveIPWhitelistEntry, connect.NewUnaryHandler(
		PathRemoveIPWhitelistEntry,
		func(ctx context.Context, req *connect.Request[pb.RemoveIPWhitelistEntryRequest]) (*connect.Response[pb.RemoveIPWhitelistEntryResponse], error) {
			resp, err := srv.RemoveIPWhitelistEntry(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// GetUsage
	mux.Handle(PathGetUsage, connect.NewUnaryHandler(
		PathGetUsage,
		func(ctx context.Context, req *connect.Request[pb.GetUsageRequest]) (*connect.Response[pb.GetUsageResponse], error) {
			resp, err := srv.GetUsage(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// SetUserTier (admin)
	mux.Handle(PathSetUserTier, connect.NewUnaryHandler(
		PathSetUserTier,
		func(ctx context.Context, req *connect.Request[pb.SetUserTierRequest]) (*connect.Response[pb.SetUserTierResponse], error) {
			resp, err := srv.SetUserTier(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// ResizeStorage
	mux.Handle(PathResizeStorage, connect.NewUnaryHandler(
		PathResizeStorage,
		func(ctx context.Context, req *connect.Request[pb.ResizeStorageRequest]) (*connect.Response[pb.ResizeStorageResponse], error) {
			resp, err := srv.ResizeStorage(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// SetAutoscale
	mux.Handle(PathSetAutoscale, connect.NewUnaryHandler(
		PathSetAutoscale,
		func(ctx context.Context, req *connect.Request[pb.SetAutoscaleRequest]) (*connect.Response[pb.SetAutoscaleResponse], error) {
			resp, err := srv.SetAutoscale(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// GetMetrics
	mux.Handle(PathGetMetrics, connect.NewUnaryHandler(
		PathGetMetrics,
		func(ctx context.Context, req *connect.Request[pb.GetMetricsRequest]) (*connect.Response[pb.GetMetricsResponse], error) {
			resp, err := srv.GetMetrics(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// GetSSLCertificates
	mux.Handle(PathGetSSLCertificates, connect.NewUnaryHandler(
		PathGetSSLCertificates,
		func(ctx context.Context, req *connect.Request[pb.GetSSLCertificatesRequest]) (*connect.Response[pb.GetSSLCertificatesResponse], error) {
			resp, err := srv.GetSSLCertificates(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	return mux
}

// NewMetadataHandler returns an http.Handler that serves MetadataService RPCs
// via the Connect protocol with JWT authentication.
func NewMetadataHandler(srv MetadataServiceServer, jwtSecret string, extraInterceptors ...connect.Interceptor) http.Handler {
	mux := http.NewServeMux()

	authInter := jwtAuthInterceptor(jwtSecret)
	allInterceptors := []connect.Interceptor{authInter}
	allInterceptors = append(allInterceptors, extraInterceptors...)

	// ListSchemaDatabases
	mux.Handle(PathListSchemaDatabases, connect.NewUnaryHandler(
		PathListSchemaDatabases,
		func(ctx context.Context, req *connect.Request[pb.ListSchemaDatabasesRequest]) (*connect.Response[pb.ListSchemaDatabasesResponse], error) {
			// Use the authenticated user ID from the JWT context.
			userID := auth.GetUserID(ctx)
			if userID != "" {
				req.Msg.UserId = userID
			}
			resp, err := srv.ListSchemaDatabases(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// ListTables
	mux.Handle(PathListTables, connect.NewUnaryHandler(
		PathListTables,
		func(ctx context.Context, req *connect.Request[pb.ListTablesRequest]) (*connect.Response[pb.ListTablesResponse], error) {
			userID := auth.GetUserID(ctx)
			if userID != "" {
				req.Msg.UserId = userID
			}
			resp, err := srv.ListTables(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// ListColumns
	mux.Handle(PathListColumns, connect.NewUnaryHandler(
		PathListColumns,
		func(ctx context.Context, req *connect.Request[pb.ListColumnsRequest]) (*connect.Response[pb.ListColumnsResponse], error) {
			userID := auth.GetUserID(ctx)
			if userID != "" {
				req.Msg.UserId = userID
			}
			resp, err := srv.ListColumns(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	// PreviewTable
	mux.Handle(PathPreviewTable, connect.NewUnaryHandler(
		PathPreviewTable,
		func(ctx context.Context, req *connect.Request[pb.PreviewTableRequest]) (*connect.Response[pb.PreviewTableResponse], error) {
			userID := auth.GetUserID(ctx)
			if userID != "" {
				req.Msg.UserId = userID
			}
			resp, err := srv.PreviewTable(ctx, req.Msg)
			if err != nil {
				return nil, err
			}
			return connect.NewResponse(resp), nil
		},
		connect.WithInterceptors(allInterceptors...),
	))

	return mux
}

// ── JWT Auth interceptor ─────────────────────────────────────────────────────

// jwtAuthInterceptor returns a Connect unary interceptor that validates JWT
// Bearer tokens from the Authorization header and injects the user ID into
// the request context. It also sets X-User-ID in request headers so
// downstream interceptors (e.g. IP whitelist) can use it.
func jwtAuthInterceptor(jwtSecret string) connect.UnaryInterceptorFunc {
	interceptor := func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Validate JWT Bearer token from Authorization header.
			authHeader := req.Header().Get("Authorization")
			if authHeader == "" {
				return nil, connect.NewError(
					connect.CodeUnauthenticated,
					fmt.Errorf("missing Authorization header"),
				)
			}
			tokenStr, ok := strings.CutPrefix(authHeader, "Bearer ")
			if !ok {
				return nil, connect.NewError(
					connect.CodeUnauthenticated,
					fmt.Errorf("invalid Authorization header format"),
				)
			}
			userID, _, role, err := auth.ValidateJWT(tokenStr, jwtSecret)
			if err != nil {
				return nil, connect.NewError(
					connect.CodeUnauthenticated,
					fmt.Errorf("invalid token"),
				)
			}
			ctx = auth.SetUserID(ctx, userID)
			ctx = auth.SetUserRole(ctx, role)
			req.Header().Set("X-User-ID", userID)
			return next(ctx, req)
		}
	}
	return connect.UnaryInterceptorFunc(interceptor)
}
