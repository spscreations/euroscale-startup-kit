// Package auth provides gRPC interceptors for API key authentication.
package auth

import (
	"context"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	// MetadataKey is the gRPC metadata key where the API key is expected.
	MetadataKey = "x-api-key"
)

// APIKeyInterceptor returns a gRPC unary server interceptor that validates
// the "x-api-key" header against the provided validKey.
//
// Requests without a matching key are rejected with codes.Unauthenticated.
// The interceptor allows the key to be provided via gRPC metadata (the
// "x-api-key" key, which gRPC normalizes to lowercase).
func APIKeyInterceptor(validKey string) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		if err := validateAPIKey(ctx, validKey); err != nil {
			return nil, err
		}
		return handler(ctx, req)
	}
}

// validateAPIKey extracts the x-api-key from gRPC metadata and checks it
// against the expected key.
func validateAPIKey(ctx context.Context, validKey string) error {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return status.Error(codes.Unauthenticated, "missing metadata")
	}

	// gRPC metadata keys are lowercased.
	values := md.Get(MetadataKey)
	if len(values) == 0 {
		return status.Error(codes.Unauthenticated, "missing x-api-key header")
	}

	key := values[0]
	if key == "" {
		return status.Error(codes.Unauthenticated, "empty x-api-key")
	}

	if key != validKey {
		return status.Error(codes.Unauthenticated, "invalid API key")
	}

	return nil
}
