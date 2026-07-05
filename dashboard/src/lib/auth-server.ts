import { betterAuth } from "better-auth";
import { createPool } from "mysql2/promise";
import { nextCookies } from "better-auth/next-js";
import { existsSync, readFileSync } from "fs";

const vtgateAddr = process.env.VTGATE_ADDR || "localhost";
const vtgatePort = Number(process.env.VTGATE_PORT) || 3306;
const dbUser = process.env.DB_USER || "root";
const dbPass = process.env.DB_PASS || "";
const dbName = process.env.DB_NAME || "euroscale_auth";

const poolConfig: Record<string, unknown> = {
  host: vtgateAddr,
  port: vtgatePort,
  user: dbUser,
  password: dbPass,
  database: dbName,
  waitForConnections: true,
  connectionLimit: 5,
};

// Use the dashboard-specific client cert (generated and mounted as a K8s secret)
const tlsDir = "/etc/euroscale/dash-tls";
const caPath = `${tlsDir}/ca.crt`;
const certPath = `${tlsDir}/tls.crt`;
const keyPath = `${tlsDir}/tls.key`;

if (existsSync(caPath) && existsSync(certPath) && existsSync(keyPath)) {
  poolConfig.ssl = {
    ca: readFileSync(caPath, "utf-8"),
    cert: readFileSync(certPath, "utf-8"),
    key: readFileSync(keyPath, "utf-8"),
  };
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

export const auth = betterAuth({
  database: createPool(poolConfig),
  emailAndPassword: { enabled: true },
  socialProviders: socialProviderConfig as Parameters<typeof betterAuth>[0]["socialProviders"],
  plugins: [nextCookies()],
});
