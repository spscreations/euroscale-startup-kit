import { betterAuth } from "better-auth";
import { createPool } from "mysql2/promise";
import { nextCookies } from "better-auth/next-js";

const vtgateAddr = process.env.VTGATE_ADDR || "localhost";
const vtgatePort = Number(process.env.VTGATE_PORT) || 3306;
const dbUser = process.env.DB_USER || "root";
const dbPass = process.env.DB_PASS || "";
const dbName = process.env.DB_NAME || "euroscale_auth";

// Build social provider config conditionally so SSO providers
// are only enabled when their respective env vars are set.
const socialProviderConfig: Record<string, unknown> = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviderConfig.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  socialProviderConfig.apple = {
    clientId: process.env.APPLE_CLIENT_ID,
    clientSecret: process.env.APPLE_CLIENT_SECRET,
  };
}

if (
  process.env.MICROSOFT_ENTRA_CLIENT_ID &&
  process.env.MICROSOFT_ENTRA_CLIENT_SECRET
) {
  socialProviderConfig.microsoft = {
    clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_ENTRA_CLIENT_SECRET,
    tenantId: process.env.MICROSOFT_ENTRA_TENANT_ID || "common",
  };
}

export const auth = betterAuth({
  database: createPool({
    host: vtgateAddr,
    port: vtgatePort,
    user: dbUser,
    password: dbPass,
    database: dbName,
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: socialProviderConfig as Parameters<
    typeof betterAuth
  >[0]["socialProviders"],
  plugins: [nextCookies()],
});
