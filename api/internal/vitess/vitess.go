// Package vitess provides a manager for interacting with a Vitess cluster
// to provision and deprovision keyspaces (databases).
package vitess

import (
	"context"
	"crypto/rand"
	"fmt"
	"math/big"
	"os/exec"
	"strings"
)

// Manager handles database provisioning operations via vtctlclient.
type Manager struct {
	vtgateAddr string
	vtctldAddr string
}

// NewManager creates a new Manager configured to talk to the given
// vtgate and vtctld addresses.
//
// vtgateAddr should be in "host:port" format (e.g. "euroscale-vtgate:3306").
//
//	Used for future health checks and direct MySQL operations.
//
// vtctldAddr should be in "host:port" format (e.g. "euroscale-vtctld:15999").
//
//	Used for keyspace lifecycle (Create/Drop) via vtctlclient.
func NewManager(vtgateAddr, vtctldAddr string) (*Manager, error) {
	return &Manager{
		vtgateAddr: vtgateAddr,
		vtctldAddr: vtctldAddr,
	}, nil
}

// Close is a no-op. Retained for backward compatibility with callers that
// defer Close.
func (m *Manager) Close() error {
	return nil
}

// CreateDatabase creates a new keyspace in Vitess via vtctlclient.
//
// Under the hood this calls:
//
//	vtctlclient -server <vtctldAddr> CreateKeyspace <name>
//
// Database names are sanitized to prevent command injection — only
// alphanumeric characters and underscores are allowed.
func (m *Manager) CreateDatabase(ctx context.Context, name string) error {
	if err := validateDatabaseName(name); err != nil {
		return err
	}

	cmd := exec.CommandContext(ctx, "vtctlclient",
		"-server", m.vtctldAddr,
		"CreateKeyspace", name,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to create keyspace %q: %w\noutput: %s", name, err, string(output))
	}

	return nil
}

// DeleteDatabase drops a keyspace from Vitess via vtctlclient.
//
// Under the hood this calls:
//
//	vtctlclient -server <vtctldAddr> DeleteKeyspace <name>
func (m *Manager) DeleteDatabase(ctx context.Context, name string) error {
	if err := validateDatabaseName(name); err != nil {
		return err
	}

	cmd := exec.CommandContext(ctx, "vtctlclient",
		"-server", m.vtctldAddr,
		"DeleteKeyspace", name,
	)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to delete keyspace %q: %w\noutput: %s", name, err, string(output))
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
// This protects against command injection since names are passed as arguments
// to vtctlclient.
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
