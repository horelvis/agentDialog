import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getDatabaseConfig } from "../config/database";

export async function runMigrations() {
  const config = getDatabaseConfig();
  const sql = postgres(config.url, { max: 1 });
  const db = drizzle(sql);

  console.log("[DB] Running migrations...");
  await migrate(db, { migrationsFolder: "./migrations" });
  console.log("[DB] Migrations complete");

  await sql.end();
}
