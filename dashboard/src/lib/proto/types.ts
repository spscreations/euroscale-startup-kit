/**
 * TypeScript types mirroring the euroscale.v1 protobuf definitions.
 *
 * Keep these in sync with: api/proto/euroscale/v1/database.proto
 */

// ── Enums / Literal Unions ──────────────────────────────────────────────────

export type DatabaseEngine = "mysql";

export type DatabaseRegion = "nuremberg" | "helsinki";

export type DatabaseStatus =
  | "creating"
  | "ready"
  | "deleting"
  | "deleted"
  | "error";

// ── Shared Types ────────────────────────────────────────────────────────────

/** Database metadata. Never contains credentials. */
export interface Database {
  /** Unique ID (UUID v4). */
  database_id: string;
  /** Database name. */
  name: string;
  /** Engine ("mysql"). */
  engine: DatabaseEngine;
  /** Region ("nuremberg" or "helsinki"). */
  region: DatabaseRegion;
  /** Hostname for connections. */
  host: string;
  /** Port number. */
  port: number;
  /** Username (prefix "u_"). */
  username: string;
  /** Status: "creating", "ready", "deleting", "deleted", "error". */
  status: DatabaseStatus;
  /** Creation timestamp (RFC 3339). */
  created_at: string;
}

// ── CreateDatabase ──────────────────────────────────────────────────────────

export interface CreateDatabaseRequest {
  /** Required. Name of the database to create. */
  name: string;
  /** Database engine. Must be "mysql". */
  engine: DatabaseEngine;
  /** Region to provision in. */
  region: DatabaseRegion;
  /** ID of the user who will own this database. */
  user_id: string;
}

export interface CreateDatabaseResponse {
  /** Unique ID assigned to this database (UUID v4). */
  database_id: string;
  /** Full MySQL connection string with embedded credentials. */
  connection_string: string;
  /** Hostname for connecting (vtgate address). */
  host: string;
  /** Port number (3306). */
  port: number;
  /** Auto-generated username (prefix "u_" + 12 alphanumeric chars). */
  username: string;
  /** Auto-generated password (48 chars). Returned ONCE. */
  password: string;
  /** PEM-encoded CA certificate for TLS verification (base64). */
  ssl_ca_pem: string;
  /** Engine used ("mysql"). */
  engine: DatabaseEngine;
  /** Region where the database was provisioned. */
  region: DatabaseRegion;
  /** Current status of the database. */
  status: DatabaseStatus;
  /** Timestamp of creation (RFC 3339). */
  created_at: string;
}

// ── DeleteDatabase ──────────────────────────────────────────────────────────

export interface DeleteDatabaseRequest {
  /** ID of the database to delete. */
  database_id: string;
}

export interface DeleteDatabaseResponse {
  /** Whether the deletion succeeded. */
  success: boolean;
  /** Human-readable message. */
  message: string;
}

// ── ListDatabases ───────────────────────────────────────────────────────────

export interface ListDatabasesRequest {
  /** Filter by user ID. Required. */
  user_id: string;
  /** Optional pagination: max results per page (default 50, max 100). */
  page_size?: number;
  /** Optional pagination token from previous response. */
  page_token?: string;
}

export interface ListDatabasesResponse {
  /** List of databases owned by the user. */
  databases: Database[];
  /** Token for the next page, empty if no more pages. */
  next_page_token: string;
  /** Total number of databases for this user. */
  total: number;
}

// ── GetDatabase ─────────────────────────────────────────────────────────────

export interface GetDatabaseRequest {
  /** ID of the database to retrieve. */
  database_id: string;
}

export interface GetDatabaseResponse {
  /** Database metadata (no credentials). */
  database: Database;
}

// ── RotateCredentials ──────────────────────────────────────────────────────

export interface RotateCredentialsRequest {
  /** ID of the database whose credentials to rotate. */
  database_id: string;
}

export interface RotateCredentialsResponse {
  /** Database ID. */
  database_id: string;
  /** New connection string with updated credentials. */
  connection_string: string;
  /** New username. */
  username: string;
  /** New password. Returned ONCE. */
  password: string;
  /** PEM-encoded CA certificate (base64). */
  ssl_ca_pem: string;
  /** Hostname. */
  host: string;
  /** Port number. */
  port: number;
}
