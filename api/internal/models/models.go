// Package models defines the core data types for the EuroScale Database Provisioning API.
package models

import "time"

// Database represents a provisioned Vitess database.
// This is the internal representation — it is never serialized directly
// to gRPC responses (the proto-generated types are used for that).
type Database struct {
	ID        string    `json:"database_id"`
	Name      string    `json:"name"`
	Engine    string    `json:"engine"`
	Region    string    `json:"region"`
	Host      string    `json:"host"`
	Port      int32     `json:"port"`
	Username  string    `json:"username"`
	Status    string    `json:"status"`
	UserID    string    `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// DatabaseCredentials holds the sensitive connection details for a database.
// These are returned ONCE on creation or rotation and stored as K8s Secrets.
type DatabaseCredentials struct {
	DatabaseID       string `json:"database_id"`
	Username         string `json:"username"`
	Password         string `json:"password"`
	ConnectionString string `json:"connection_string"`
	SSLCAPem         string `json:"ssl_ca_pem"`
}

// Pre-defined statuses for database lifecycle.
const (
	StatusCreating = "creating"
	StatusReady    = "ready"
	StatusDeleting = "deleting"
	StatusDeleted  = "deleted"
	StatusError    = "error"
)

// Engine and region constants.
const (
	EngineMySQL     = "mysql"
	RegionNuremberg = "nuremberg"
	RegionHelsinki  = "helsinki"
)
