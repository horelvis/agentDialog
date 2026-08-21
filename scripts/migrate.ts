/**
 * Applies pending Drizzle migrations.
 *
 * This deliberately does NOT call loadEnv(). That validates the whole
 * application schema, so a variable the API needs at runtime but a migration
 * never touches — a webhook signing secret, an SMTP host — aborts the
 * migration too. It is not hypothetical: the v0.8.0 deploy failed here because
 * INBOUND_EMAIL_WEBHOOK_SECRET was missing, a secret this script has no use
 * for, after the image had already been pushed. Migrations need a database and
 * nothing else.
 */
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[MIGRATE] DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
const db = drizzle(sql);

console.log("[MIGRATE] Running migrations...");
await migrate(db, { migrationsFolder: "./migrations" });
console.log("[MIGRATE] Migrations complete");

await sql.end();
process.exit(0);
