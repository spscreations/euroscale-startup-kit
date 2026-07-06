// Package auth provides authentication and authorization primitives for
// the EuroScale API: JWT token generation/validation, a user store with
// bcrypt password hashing, context helpers, and gRPC interceptors.
//
// Re-exports for backward compatibility:
//   - MetadataKey: the gRPC metadata key for API keys (kept for legacy interop).
//   - JWTUnaryInterceptor: the primary gRPC interceptor (replaces API key auth).
//   - GetUserID / SetUserID / GetUserRole / SetUserRole: context helpers.
//   - UserStore, User, GenerateJWT, ValidateJWT, VerifyHMAC.
package auth

const (
	// MetadataKey is the gRPC metadata key where the API key is expected.
	// Kept for backward compatibility with internal tooling.
	MetadataKey = "x-api-key"
)
