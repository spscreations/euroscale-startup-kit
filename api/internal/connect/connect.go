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
)

// ── Handler construction ─────────────────────────────────────────────────────

// NewHandler returns an http.Handler that serves all five DatabaseService RPCs
// via the Connect protocol. It validates an API key on every request using the
// same auth logic as the gRPC interceptor (x-api-key header or Authorization:
// Bearer token).
func NewHandler(srv DatabaseServiceServer, apiKey string) http.Handler {
	mux := http.NewServeMux()

	interceptor := authInterceptor(apiKey)

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
		connect.WithInterceptors(interceptor),
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
		connect.WithInterceptors(interceptor),
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
		connect.WithInterceptors(interceptor),
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
		connect.WithInterceptors(interceptor),
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
		connect.WithInterceptors(interceptor),
	))

	return mux
}

// ── Auth interceptor ─────────────────────────────────────────────────────────

// authInterceptor returns a Connect unary interceptor that validates the API key
// from either the "x-api-key" header or an "Authorization: Bearer <key>" header.
// This mirrors the auth logic in the gRPC interceptor so both transports share
// the same auth semantics.
func authInterceptor(apiKey string) connect.UnaryInterceptorFunc {
	interceptor := func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			// Check x-api-key header.
			if key := req.Header().Get("x-api-key"); key == apiKey {
				return next(ctx, req)
			}

			// Check Authorization: Bearer <key>.
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
