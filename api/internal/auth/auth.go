// Package auth provides authentication and authorization primitives for
// the EuroScale API: JWT token generation/validation, a user store with
// bcrypt password hashing, context helpers, and gRPC interceptors.
//
// Re-exports for backward compatibility:
//   - MetadataKey: kept for legacy interop (deprecated — use Authorization header).
//   - JWTUnaryInterceptor: the primary gRPC interceptor (validates JWT Bearer tokens).
//   - GetUserID / SetUserID / GetUserRole / SetUserRole: context helpers.
//   - UserStore, User, GenerateJWT, ValidateJWT, VerifyHMAC.
package auth

const (
	// MetadataKey is the gRPC metadata key where the API key is expected.
	// Deprecated: use the Authorization header with a Bearer token instead.
	MetadataKey = "x-api-key"
)
