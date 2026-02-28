import { loadEnv } from "../src/env";
loadEnv();

import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL!;
const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

console.log("[MIGRATE] Running migrations...");
await migrate(db, { migrationsFolder: "./migrations" });
console.log("[MIGRATE] Migrations complete");

await sql.end();
process.exit(0);
