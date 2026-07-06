import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { mysqlTable, varchar, int, text, datetime } from "drizzle-orm/mysql-core";
import { readFileSync } from "fs";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return val;
}

// Lazy auth initializer — avoids crashing during `next build` when DB env
// vars aren't available yet. Created on first use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _auth: any = null;

// Define auth tables for Better Auth using Drizzle ORM
const user = mysqlTable("user", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: int("emailVerified").notNull().default(0),
  image: text("image"),
  createdAt: datetime("createdAt").notNull(),
  updatedAt: datetime("updatedAt").notNull(),
});

const session = mysqlTable("session", {
  id: varchar("id", { length: 255 }).primaryKey(),
  expiresAt: datetime("expiresAt").notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  createdAt: datetime("createdAt").notNull(),
  updatedAt: datetime("updatedAt").notNull(),
  ipAddress: varchar("ipAddress", { length: 255 }),
  userAgent: text("userAgent"),
  userId: varchar("userId", { length: 255 }).notNull().references(() => user.id, { onDelete: "cascade" }),
});

const account = mysqlTable("account", {
  id: varchar("id", { length: 255 }).primaryKey(),
  accountId: varchar("accountId", { length: 255 }).notNull(),
  providerId: varchar("providerId", { length: 255 }).notNull(),
  userId: varchar("userId", { length: 255 }).notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: datetime("accessTokenExpiresAt"),
  refreshTokenExpiresAt: datetime("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: datetime("createdAt").notNull(),
  updatedAt: datetime("updatedAt").notNull(),
});

const verification = mysqlTable("verification", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: text("value").notNull(),
  expiresAt: datetime("expiresAt").notNull(),
  createdAt: datetime("createdAt"),
  updatedAt: datetime("updatedAt"),
});

function getAuth() {
  if (_auth) return _auth;

  const DB_HOST = requireEnv("AUTH_DB_HOST");
  const DB_PORT = parseInt(requireEnv("AUTH_DB_PORT"), 10);
  const DB_USER = requireEnv("AUTH_DB_USER");
  const DB_PASS = requireEnv("AUTH_DB_PASS");
  const DB_NAME = requireEnv("AUTH_DB_NAME");

  const pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: DB_NAME,
    waitForConnections: true, connectionLimit: 5, connectTimeout: 10000,
    ssl: process.env.DB_SSL_CA
      ? {
          ca: readFileSync(process.env.DB_SSL_CA),
          cert: process.env.DB_SSL_CERT ? readFileSync(process.env.DB_SSL_CERT) : undefined,
          key: process.env.DB_SSL_KEY ? readFileSync(process.env.DB_SSL_KEY) : undefined,
        }
      : undefined,
  });

  const db = drizzle(pool);

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

  _auth = betterAuth({
    database: drizzleAdapter(db, { provider: "mysql", schema: { user, session, account, verification } }),
    basePath: "/api/better-auth",
    emailAndPassword: { enabled: true },
    socialProviders: socialProviderConfig as Parameters<typeof betterAuth>[0]["socialProviders"],
    plugins: [nextCookies()],
  });

  return _auth;
}

export { getAuth };
