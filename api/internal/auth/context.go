// Package auth provides context helpers for passing the authenticated user
// ID through gRPC and HTTP request contexts.
package auth

import "context"

// contextKey is an unexported type used for context keys to avoid collisions.
type contextKey string

// UserIDKey is the context key under which the authenticated user ID is stored.
const UserIDKey contextKey = "user_id"

// UserRoleKey is the context key for the user's role (e.g. "admin").
const UserRoleKey contextKey = "user_role"

// GetUserID extracts the authenticated user ID from the context.
// Returns an empty string if not found.
func GetUserID(ctx context.Context) string {
	if v, ok := ctx.Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}

// SetUserID returns a new context with the user ID set.
func SetUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, UserIDKey, userID)
}

// GetUserRole extracts the authenticated user's role from the context.
func GetUserRole(ctx context.Context) string {
	if v, ok := ctx.Value(UserRoleKey).(string); ok {
		return v
	}
	return ""
}

// SetUserRole returns a new context with the user role set.
func SetUserRole(ctx context.Context, role string) context.Context {
	return context.WithValue(ctx, UserRoleKey, role)
}
