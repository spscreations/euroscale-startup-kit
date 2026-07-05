import { betterAuth } from "better-auth";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { nextCookies } from "better-auth/next-js";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

// Lazy Kysely init — only happens at runtime, not during build
function createDb() {
  if (g.__euroscale_auth_kysely) return g.__euroscale_auth_kysely;

  // Skip during Next.js build
  if (process.env.NEXT_PHASE === "phase-production-build") {
    g.__euroscale_auth_kysely = null;
    return null as any;
  }

  const sqlite = new Database(
    process.env.NODE_ENV === "production"
      ? "/tmp/euroscale-auth.db"
      : `/tmp/euroscale-auth-${process.pid}.db`
  );

  sqlite.pragma("journal_mode = WAL");

  // Create tables if they don't exist — Kysely adapter doesn't auto-create them
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL UNIQUE,
      "email_verified" integer NOT NULL DEFAULT 0,
      "image" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "session" (
      "id" text PRIMARY KEY NOT NULL,
      "expires_at" integer NOT NULL,
      "token" text NOT NULL UNIQUE,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL,
      "ip_address" text,
      "user_agent" text,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS "account" (
      "id" text PRIMARY KEY NOT NULL,
      "account_id" text NOT NULL,
      "provider_id" text NOT NULL,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "access_token" text,
      "refresh_token" text,
      "id_token" text,
      "access_token_expires_at" integer,
      "refresh_token_expires_at" integer,
      "scope" text,
      "password" text,
      "created_at" text NOT NULL,
      "updated_at" text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "verification" (
      "id" text PRIMARY KEY NOT NULL,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expires_at" integer NOT NULL,
      "created_at" text,
      "updated_at" text
    );
  `);

  const db = new Kysely<any>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  g.__euroscale_auth_kysely = db;
  return db;
}

const socialProviderConfig: Record<string, unknown> = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviderConfig.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  socialProviderConfig.apple = { clientId: process.env.APPLE_CLIENT_ID, clientSecret: process.env.APPLE_CLIENT_SECRET };
}
if (process.env.MICROSOFT_ENTRA_CLIENT_ID && process.env.MICROSOFT_ENTRA_CLIENT_SECRET) {
  socialProviderConfig.microsoft = { clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID, clientSecret: process.env.MICROSOFT_ENTRA_CLIENT_SECRET, tenantId: process.env.MICROSOFT_ENTRA_TENANT_ID || "common" };
}

// Kysely adapter auto-creates tables and handles boolean→integer, Date→string conversions
export const auth = betterAuth({
  database: kyselyAdapter(createDb(), { type: "sqlite" }),
  emailAndPassword: { enabled: true },
  socialProviders: socialProviderConfig as Parameters<typeof betterAuth>[0]["socialProviders"],
  plugins: [nextCookies()],
});
