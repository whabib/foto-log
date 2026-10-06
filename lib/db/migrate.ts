import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getPool } from "./index";

// Arbitrary constant so only one instance migrates at a time.
const MIGRATION_LOCK_ID = 4_206_9001;

/** Applies pending migrations from ./drizzle. Safe to call from several instances at once. */
export async function runMigrations(): Promise<void> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    try {
      await migrate(drizzle(client), {
        migrationsFolder: path.join(process.cwd(), "drizzle"),
      });
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}
