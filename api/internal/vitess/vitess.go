// Package vitess provides a manager for interacting with a Vitess vtgate instance
// to provision and deprovision databases.
package vitess

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"math/big"
	"strings"

	// MySQL driver for vtgate (speaks MySQL protocol).
	_ "github.com/go-sql-driver/mysql"
)

// Manager handles database provisioning operations via vtgate.
type Manager struct {
	db *sql.DB
}

// NewManager creates a new Manager connected to the given vtgate address.
// vtgateAddr should be in "host:port" format (e.g. "euroscale-vtgate:3306").
func NewManager(vtgateAddr string) (*Manager, error) {
	// Connect to vtgate via MySQL protocol. No password — vtgate in K8s
	// typically runs without authentication when accessed internally.
	dsn := fmt.Sprintf("root:@tcp(%s)/", vtgateAddr)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open vtgate connection: %w", err)
	}

	// Verify connectivity.
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping vtgate at %s: %w", vtgateAddr, err)
	}

	return &Manager{db: db}, nil
}

// Close shuts down the vtgate connection pool.
func (m *Manager) Close() error {
	return m.db.Close()
}

// CreateDatabase creates a new database in Vitess.
// Database names are sanitized to prevent SQL injection — only alphanumeric
// characters and underscores are allowed.
func (m *Manager) CreateDatabase(ctx context.Context, name string) error {
	if err := validateDatabaseName(name); err != nil {
		return err
	}

	// Vitess supports CREATE DATABASE via vtgate. The IF NOT EXISTS
	// clause makes this idempotent.
	query := fmt.Sprintf("CREATE DATABASE IF NOT EXISTS `%s`", name)

	_, err := m.db.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to create database %q: %w", name, err)
	}

	return nil
}

// DeleteDatabase drops a database from Vitess.
func (m *Manager) DeleteDatabase(ctx context.Context, name string) error {
	if err := validateDatabaseName(name); err != nil {
		return err
	}

	query := fmt.Sprintf("DROP DATABASE IF EXISTS `%s`", name)

	_, err := m.db.ExecContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to drop database %q: %w", name, err)
	}

	return nil
}

// GenerateCredentials creates a random username and password for a database user.
//
// Username: prefix "u_" + 12 alphanumeric characters (crypto/rand).
// Password: 48 characters with alphanumeric + special characters (crypto/rand).
func GenerateCredentials() (username string, password string, err error) {
	username, err = generateUsername()
	if err != nil {
		return "", "", fmt.Errorf("failed to generate username: %w", err)
	}

	password, err = generatePassword()
	if err != nil {
		return "", "", fmt.Errorf("failed to generate password: %w", err)
	}

	return username, password, nil
}

// ── helpers ─────────────────────────────────────────────────────────────────

// validateDatabaseName ensures the name contains only safe characters.
func validateDatabaseName(name string) error {
	if name == "" {
		return fmt.Errorf("database name must not be empty")
	}
	if len(name) > 64 {
		return fmt.Errorf("database name must be 64 characters or fewer")
	}
	for _, r := range name {
		if !isSafeNameChar(r) {
			return fmt.Errorf("database name %q contains invalid character %q", name, r)
		}
	}
	return nil
}

func isSafeNameChar(r rune) bool {
	return (r >= 'a' && r <= 'z') ||
		(r >= 'A' && r <= 'Z') ||
		(r >= '0' && r <= '9') ||
		r == '_'
}

const (
	usernameCharset = "abcdefghijklmnopqrstuvwxyz0123456789"
	passwordCharset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?"
	usernameLength  = 12
	passwordLength  = 48
)

func generateUsername() (string, error) {
	return randomString(usernameCharset, usernameLength)
}

func generatePassword() (string, error) {
	return randomString(passwordCharset, passwordLength)
}

// randomString generates a cryptographically random string from the given
// character set using crypto/rand.
func randomString(charset string, length int) (string, error) {
	var b strings.Builder
	b.Grow(length)

	charsetLen := big.NewInt(int64(len(charset)))
	for i := 0; i < length; i++ {
		idx, err := rand.Int(rand.Reader, charsetLen)
		if err != nil {
			return "", fmt.Errorf("crypto/rand error: %w", err)
		}
		b.WriteByte(charset[idx.Int64()])
	}

	return b.String(), nil
}
