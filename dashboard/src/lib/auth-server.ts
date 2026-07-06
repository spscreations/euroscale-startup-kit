import { betterAuth } from "better-auth";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { nextCookies } from "better-auth/next-js";
import mysql from "mysql2/promise";
import { Kysely, MysqlDialect } from "kysely";

const DB_HOST = process.env.AUTH_DB_HOST || "euroscale-auth-db";
const DB_PORT = Number(process.env.AUTH_DB_PORT) || 3306;
const DB_USER = process.env.AUTH_DB_USER || "root";
const DB_PASS = process.env.AUTH_DB_PASS || "euroscale-auth";
const DB_NAME = process.env.AUTH_DB_NAME || "euroscale_auth";

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

// Lazy init — auth is created on first request, not at module load time
let _auth: any = null;

export async function getAuth() {
  if (_auth) return _auth;

  const pool = mysql.createPool({
    host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: DB_NAME,
    waitForConnections: true, connectionLimit: 5,
    connectTimeout: 10000,
  });

  _auth = betterAuth({
    database: kyselyAdapter(new Kysely<any>({ dialect: new MysqlDialect({ pool }) }), { type: "mysql" }),
    emailAndPassword: { enabled: true },
    socialProviders: socialProviderConfig as Parameters<typeof betterAuth>[0]["socialProviders"],
    plugins: [nextCookies()],
  });
  return _auth;
}
