import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

/**
 * Connects to Cloud SQL through the Cloud SQL connector when
 * INSTANCE_CONNECTION_NAME is set (production), otherwise to DATABASE_URL
 * (local dev, default: the docker-compose Postgres).
 */
async function createPool(): Promise<Pool> {
  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
  if (instanceConnectionName) {
    const { Connector, IpAddressTypes } = await import("@google-cloud/cloud-sql-connector");
    const connector = new Connector();
    const options = await connector.getOptions({
      instanceConnectionName,
      ipType: IpAddressTypes.PRIVATE,
    });
    return new Pool({
      ...options,
      user: process.env.DB_USER ?? "fotolog",
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME ?? "fotolog",
      max: 5,
    });
  }
  return new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://fotolog:fotolog@127.0.0.1:54329/fotolog",
    max: 5,
  });
}

// Cached on globalThis so dev hot reloads don't open new pools.
const cache = globalThis as unknown as { fotologPool?: Promise<Pool> };

export function getPool(): Promise<Pool> {
  cache.fotologPool ??= createPool().catch((err) => {
    cache.fotologPool = undefined;
    throw err;
  });
  return cache.fotologPool;
}

export async function getDb(): Promise<Db> {
  return drizzle(await getPool(), { schema });
}

/**
 * Runs `fn` while holding a Postgres advisory lock named `name`, so only one
 * Cloud Run instance at a time runs code under the same lock name.
 */
export async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '30s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [name]);
    return await fn();
  } finally {
    await client.query("COMMIT").catch(() => {});
    client.release();
  }
}
