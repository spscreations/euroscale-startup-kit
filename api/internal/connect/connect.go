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

	// MetadataService paths.
	PathListSchemaDatabases = "/euroscale.v1.MetadataService/ListSchemaDatabases"
	PathListTables          = "/euroscale.v1.MetadataService/ListTables"
	PathListColumns         = "/euroscale.v1.MetadataService/ListColumns"
	PathPreviewTable        = "/euroscale.v1.MetadataService/PreviewTable"
)

// ── Handler construction ─────────────────────────────────────────────────────

// NewHandler returns an http.Handler that serves all five DatabaseService RPCs
// via the Connect protocol. It validates an API key on every request using the
// same auth logic as the gRPC interceptor (x-api-key header or Authorization:
// Bearer token). Additional interceptors (e.g., IP whitelist) can be passed
// and are chained after the auth interceptor.
func NewHandler(srv DatabaseServiceServer, apiKey string, extraInterceptors ...connect.Interceptor) http.Handler {
	mux := http.NewServeMux()

	authInter := authInterceptor(apiKey)

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

	return mux
}

// NewMetadataHandler returns an http.Handler that serves MetadataService RPCs
// via the Connect protocol with API key authentication.
func NewMetadataHandler(srv MetadataServiceServer, apiKey string, extraInterceptors ...connect.Interceptor) http.Handler {
	mux := http.NewServeMux()

	authInter := authInterceptor(apiKey)
	allInterceptors := []connect.Interceptor{authInter}
	allInterceptors = append(allInterceptors, extraInterceptors...)

	// ListSchemaDatabases
	mux.Handle(PathListSchemaDatabases, connect.NewUnaryHandler(
		PathListSchemaDatabases,
		func(ctx context.Context, req *connect.Request[pb.ListSchemaDatabasesRequest]) (*connect.Response[pb.ListSchemaDatabasesResponse], error) {
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

// ── Auth interceptor ─────────────────────────────────────────────────────────

// authInterceptor returns a Connect unary interceptor that validates the API key
// from either the "x-api-key" header or an "Authorization: *** Bearer token.
// This mirrors the auth logic in the gRPC interceptor so both transports share
// the same auth semantics.
func authInterceptor(apiKey string) connect.UnaryInterceptorFunc {
	interceptor := func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Check x-api-key header.
			if key := req.Header().Get("x-api-key"); key == apiKey {
				return next(ctx, req)
			}

			// Check Authorization: Bearer ***
			if auth := req.Header().Get("Authorization"); auth != "" {
				if key, ok := strings.CutPrefix(auth, "Bearer "); ok && key == apiKey {
					return next(ctx, req)
				}
			}

			return nil, connect.NewError(
				connect.CodeUnauthenticated,
				fmt.Errorf("invalid or missing API key"),
			)
		}
	}
	return connect.UnaryInterceptorFunc(interceptor)
}
