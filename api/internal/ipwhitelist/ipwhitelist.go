// Package ipwhitelist provides per-user IP whitelist storage and enforcement
// using Kubernetes Secrets, following the same pattern as api/internal/secrets.
package ipwhitelist

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// Store manages per-user IP whitelists backed by K8s Secrets.
// Each user's whitelist is stored in a Secret named "ipwl-{userID}"
// with a single key "ips" containing a JSON array of IPs/CIDRs.
type Store struct {
	clientset *kubernetes.Clientset
	namespace string
}

// NewStore creates a new IP whitelist store.
func NewStore(clientset *kubernetes.Clientset, namespace string) *Store {
	return &Store{
		clientset: clientset,
		namespace: namespace,
	}
}

// secretNameFor returns the deterministic Secret name for a user's whitelist.
// The userID is lowercased because K8s Secret names must be valid RFC 1123 subdomains (lowercase).
func secretNameFor(userID string) string {
	return fmt.Sprintf("ipwl-%s", strings.ToLower(userID))
}

// GetIPs returns the whitelisted IPs/CIDRs for a user.
// Returns an empty slice (not nil) if no whitelist exists yet.
func (s *Store) GetIPs(ctx context.Context, userID string) ([]string, error) {
	secret, err := s.clientset.CoreV1().Secrets(s.namespace).Get(ctx, secretNameFor(userID), metav1.GetOptions{})
	if err != nil {
		// If the Secret doesn't exist, the user has no whitelist configured.
		return []string{}, nil
	}

	ipsJSON, ok := secret.Data["ips"]
	if !ok {
		return []string{}, nil
	}

	var ips []string
	if err := json.Unmarshal(ipsJSON, &ips); err != nil {
		return nil, fmt.Errorf("failed to unmarshal IP whitelist for user %q: %w", userID, err)
	}

	return ips, nil
}

// AddIP adds an IP/CIDR to the user's whitelist, creating the Secret if needed.
func (s *Store) AddIP(ctx context.Context, userID string, ip string) error {
	if err := validateIP(ip); err != nil {
		return err
	}

	// Normalize the IP string.
	ip = strings.TrimSpace(ip)

	// Get current whitelist (read-modify-write).
	existing, err := s.GetIPs(ctx, userID)
	if err != nil {
		return err
	}

	// Check for duplicates.
	for _, e := range existing {
		if e == ip {
			return fmt.Errorf("IP %q is already in the whitelist", ip)
		}
	}

	existing = append(existing, ip)
	return s.saveIPs(ctx, userID, existing)
}

// RemoveIP removes an IP/CIDR from the user's whitelist.
// Returns an error if the IP is not found.
func (s *Store) RemoveIP(ctx context.Context, userID string, ip string) error {
	ip = strings.TrimSpace(ip)

	existing, err := s.GetIPs(ctx, userID)
	if err != nil {
		return err
	}

	found := false
	filtered := make([]string, 0, len(existing))
	for _, e := range existing {
		if e == ip {
			found = true
			continue
		}
		filtered = append(filtered, e)
	}

	if !found {
		return fmt.Errorf("IP %q not found in whitelist", ip)
	}

	return s.saveIPs(ctx, userID, filtered)
}

// IsAllowed checks whether the given client IP is allowed for the given user.
// An empty whitelist (not configured) means ALL IPs are allowed.
func (s *Store) IsAllowed(ctx context.Context, userID string, clientIP string) (bool, error) {
	ips, err := s.GetIPs(ctx, userID)
	if err != nil {
		return false, err
	}

	// If no whitelist is configured, deny all IPs (fail-closed).
	// Users must explicitly add at least one IP/CIDR to allow connections.
	if len(ips) == 0 {
		return false, nil
	}

	client := net.ParseIP(clientIP)
	if client == nil {
		return false, fmt.Errorf("invalid client IP: %q", clientIP)
	}

	for _, entry := range ips {
		entry = strings.TrimSpace(entry)

		// Check if entry is a CIDR range.
		if strings.Contains(entry, "/") {
			_, cidrNet, err := net.ParseCIDR(entry)
			if err != nil {
				continue
			}
			if cidrNet.Contains(client) {
				return true, nil
			}
		} else {
			// Exact IP match.
			allowed := net.ParseIP(entry)
			if allowed != nil && allowed.Equal(client) {
				return true, nil
			}
		}
	}

	return false, nil
}

// saveIPs persists the IP list to the K8s Secret (create or update).
func (s *Store) saveIPs(ctx context.Context, userID string, ips []string) error {
	ipsJSON, err := json.Marshal(ips)
	if err != nil {
		return fmt.Errorf("failed to marshal IP whitelist: %w", err)
	}

	name := secretNameFor(userID)

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: s.namespace,
			Labels: map[string]string{
				"app":     "euroscale",
				"managed": "true",
				"type":    "ip-whitelist",
				"user_id": userID,
			},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"ips": ipsJSON,
		},
	}

	// Try update first; if it doesn't exist, create.
	_, err = s.clientset.CoreV1().Secrets(s.namespace).Update(ctx, secret, metav1.UpdateOptions{})
	if err != nil {
		// Fall back to create.
		_, err = s.clientset.CoreV1().Secrets(s.namespace).Create(ctx, secret, metav1.CreateOptions{})
		if err != nil {
			return fmt.Errorf("failed to save IP whitelist for user %q: %w", userID, err)
		}
	}

	return nil
}

// validateIP checks that the given string is a valid IP or CIDR.
func validateIP(ip string) error {
	ip = strings.TrimSpace(ip)

	if strings.Contains(ip, "/") {
		_, _, err := net.ParseCIDR(ip)
		if err != nil {
			return fmt.Errorf("invalid CIDR %q: %w", ip, err)
		}
		return nil
	}

	parsed := net.ParseIP(ip)
	if parsed == nil {
		return fmt.Errorf("invalid IP address: %q", ip)
	}

	return nil
}
