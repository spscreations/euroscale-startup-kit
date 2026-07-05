// Ad-hoc verification: runtime import of auth-server deps with SQLite/Drizzle
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";

const sqlite = new Database(":memory:");
const db = drizzle(sqlite);
const adapter = drizzleAdapter(db, { provider: "sqlite" });

console.log("✓ drizzleAdapter created:", typeof adapter);
console.log("  adapter.id:", adapter.id);
console.log("  adapter keys:", Object.keys(adapter).join(", "));
sqlite.close();
console.log("✓ All imports resolve, adapter initializes, connection closes cleanly");
