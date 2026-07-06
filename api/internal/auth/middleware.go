// Package auth — JWT middleware and user store.
//
// Provides:
//   - UserStore: in-memory user registry with bcrypt password hashing
//   - GenerateJWT / ValidateJWT: per-user JWT token management
//   - JWTUnaryInterceptor: gRPC interceptor that validates JWT and injects user_id into context
package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

// ── User store ──────────────────────────────────────────────────────────────

// User represents a registered user.
type User struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	PasswordHash string `json:"password_hash"`
	Role         string `json:"role"` // "user" or "admin"
	CreatedAt    time.Time `json:"created_at"`
}

// UserStore is a thread-safe in-memory user registry.
type UserStore struct {
	mu    sync.RWMutex
	users map[string]*User // email -> User
	byID  map[string]*User // id -> User
}

// NewUserStore creates a new empty user store.
func NewUserStore() *UserStore {
	return &UserStore{
		users: make(map[string]*User),
		byID:  make(map[string]*User),
	}
}

// CreateUser registers a new user with a bcrypt-hashed password.
// Returns an error if the email already exists.
func (s *UserStore) CreateUser(email, name, password string, role string) (*User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.users[email]; exists {
		return nil, fmt.Errorf("user with email %q already exists", email)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	if role == "" {
		role = "user"
	}

	user := &User{
		ID:           uuid.New().String(),
		Name:         name,
		Email:        email,
		PasswordHash: string(hash),
		Role:         role,
		CreatedAt:    time.Now().UTC(),
	}

	s.users[email] = user
	s.byID[user.ID] = user
	return user, nil
}

// Authenticate verifies email + password and returns the user on success.
// Returns an error if the email is not found or the password is wrong.
func (s *UserStore) Authenticate(email, password string) (*User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, exists := s.users[email]
	if !exists {
		return nil, errors.New("invalid email or password")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("invalid email or password")
	}

	return user, nil
}

// GetUser returns a user by ID or nil if not found.
func (s *UserStore) GetUser(userID string) *User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.byID[userID]
}

// HasUser returns true if any user exists (used to seed admin on first run).
func (s *UserStore) HasUser() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.users) > 0
}

// ── JWT helpers ─────────────────────────────────────────────────────────────

// jwtClaims represents the custom claims embedded in JWT tokens.
type jwtClaims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// GenerateJWT creates a signed JWT for the given user, valid for the specified
// duration (e.g. 24 * time.Hour).
func GenerateJWT(userID, email, role, jwtSecret string, ttl time.Duration) (string, error) {
	now := time.Now().UTC()
	claims := jwtClaims{
		UserID: userID,
		Email:  email,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "euroscale",
			Subject:   userID,
			Audience:  []string{"euroscale-api"},
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ID:        uuid.New().String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(jwtSecret))
}

// ValidateJWT parses and validates a JWT token string, returning the user ID
// and claims on success.
func ValidateJWT(tokenString, jwtSecret string) (userID, email, role string, err error) {
	token, err := jwt.ParseWithClaims(tokenString, &jwtClaims{},
		func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(jwtSecret), nil
		},
	)
	if err != nil {
		return "", "", "", fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*jwtClaims)
	if !ok || !token.Valid {
		return "", "", "", errors.New("invalid token claims")
	}

	return claims.UserID, claims.Email, claims.Role, nil
}

// ── gRPC JWT interceptor ────────────────────────────────────────────────────

// JWTUnaryInterceptor returns a gRPC unary server interceptor that validates
// a JWT Bearer token from the "authorization" metadata header and injects
// the user ID into the request context.
func JWTUnaryInterceptor(jwtSecret string) grpc.UnaryServerInterceptor {
	return func(
		ctx context.Context,
		req interface{},
		info *grpc.UnaryServerInfo,
		handler grpc.UnaryHandler,
	) (interface{}, error) {
		md, ok := metadata.FromIncomingContext(ctx)
		if !ok {
			return nil, status.Error(codes.Unauthenticated, "missing metadata")
		}

		// Validate JWT Bearer token from Authorization header.
		if authVals := md.Get("authorization"); len(authVals) > 0 {
			for _, v := range authVals {
				if len(v) > 7 && v[:7] == "Bearer " {
					tokenStr := v[7:]
					userID, _, role, err := ValidateJWT(tokenStr, jwtSecret)
					if err != nil {
						return nil, status.Errorf(codes.Unauthenticated, "invalid token: %v", err)
					}
					ctx = SetUserID(ctx, userID)
					ctx = SetUserRole(ctx, role)
					return handler(ctx, req)
				}
			}
		}

		return nil, status.Error(codes.Unauthenticated, "missing or invalid Authorization header")
	}
}

// ── HMAC helpers (used by Mollie webhook verification) ──────────────────────

// VerifyHMAC checks whether the given signature matches the HMAC-SHA256 of
// the body using the provided secret key.
func VerifyHMAC(body []byte, signature, secret string) bool {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
