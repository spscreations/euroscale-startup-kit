// Package ipcheck provides utilities for validating IP addresses and CIDR
// ranges against whitelists.
package ipcheck

import (
	"fmt"
	"net"
)

// IsIPAllowed checks if clientIP matches any CIDR in the whitelist.
// Returns (true, "") if the IP is allowed, or (false, reason) if not.
func IsIPAllowed(clientIP string, whitelist []string) (bool, string) {
	ip := net.ParseIP(clientIP)
	if ip == nil {
		return false, "invalid client IP"
	}
	for _, cidr := range whitelist {
		_, cidrNet, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if cidrNet.Contains(ip) {
			return true, ""
		}
	}
	return false, fmt.Sprintf("IP %s is not in the whitelist", clientIP)
}

// ValidateCIDR validates that a CIDR string is parseable.
func ValidateCIDR(cidr string) error {
	_, _, err := net.ParseCIDR(cidr)
	if err != nil {
		return fmt.Errorf("invalid CIDR: %w", err)
	}
	return nil
}
