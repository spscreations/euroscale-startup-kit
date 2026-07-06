import { betterAuth } from "better-auth";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { nextCookies } from "better-auth/next-js";
import mysql from "mysql2/promise";
import { Kysely, MysqlDialect } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;

const DB_HOST = process.env.AUTH_DB_HOST || "euroscale-auth-db";
const DB_PORT = Number(process.env.AUTH_DB_PORT) || 3306;
const DB_USER = process.env.AUTH_DB_USER || "root";
const DB_PASS = process.env.AUTH_DB_PASS || "euroscale-auth";
const DB_NAME = process.env.AUTH_DB_NAME || "euroscale_auth";

async function getDb() {
  if (g.__euroscale_auth_kysely) return g.__euroscale_auth_kysely;
  if (process.env.NEXT_PHASE === "phase-production-build") return null as any;

  const pool = mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASS,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
  });

  // Create tables if they don't exist
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`user\` (
        \`id\` varchar(255) PRIMARY KEY NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`email\` varchar(255) NOT NULL UNIQUE,
        \`emailVerified\` int NOT NULL DEFAULT 0,
        \`image\` text,
        \`createdAt\` datetime NOT NULL,
        \`updatedAt\` datetime NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`session\` (
        \`id\` varchar(255) PRIMARY KEY NOT NULL,
        \`expiresAt\` bigint NOT NULL,
        \`token\` varchar(255) NOT NULL UNIQUE,
        \`createdAt\` datetime NOT NULL,
        \`updatedAt\` datetime NOT NULL,
        \`ipAddress\` varchar(255),
        \`userAgent\` text,
        \`userId\` varchar(255) NOT NULL,
        FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`account\` (
        \`id\` varchar(255) PRIMARY KEY NOT NULL,
        \`accountId\` varchar(255) NOT NULL,
        \`providerId\` varchar(255) NOT NULL,
        \`userId\` varchar(255) NOT NULL,
        \`accessToken\` text,
        \`refreshToken\` text,
        \`idToken\` text,
        \`accessTokenExpiresAt\` bigint,
        \`refreshTokenExpiresAt\` bigint,
        \`scope\` text,
        \`password\` text,
        \`createdAt\` datetime NOT NULL,
        \`updatedAt\` datetime NOT NULL,
        FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS \`verification\` (
        \`id\` varchar(255) PRIMARY KEY NOT NULL,
        \`identifier\` varchar(255) NOT NULL,
        \`value\` text NOT NULL,
        \`expiresAt\` bigint NOT NULL,
        \`createdAt\` datetime,
        \`updatedAt\` datetime
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } finally {
    conn.release();
  }

  const db = new Kysely<any>({ dialect: new MysqlDialect({ pool }) });
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

// Create a promise that resolves with the auth instance
const authPromise = getDb().then((db) =>
  betterAuth({
    database: kyselyAdapter(db, { type: "mysql" }),
    emailAndPassword: { enabled: true },
    socialProviders: socialProviderConfig as Parameters<typeof betterAuth>[0]["socialProviders"],
    plugins: [nextCookies()],
  })
);

// Export a proxy that resolves the auth on first access
export const auth = new Proxy({} as any, {
  get(_, prop: string) {
    return (...args: any[]) => authPromise.then((a: any) => a[prop](...args));
  },
});
