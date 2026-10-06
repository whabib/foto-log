import "server-only";
import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
  RuntimeLock,
} from "@atproto/oauth-client-node";
import { eq, lt } from "drizzle-orm";
import { decrypt, encrypt } from "@/lib/crypto";
import { getDb, getPool } from "@/lib/db";
import { oauthSession, oauthState } from "@/lib/db/schema";

const STATE_TTL_MS = 60 * 60 * 1000;

export const stateStore: NodeSavedStateStore = {
  async set(key: string, state: NodeSavedState) {
    const db = await getDb();
    const value = encrypt(JSON.stringify(state), `oauth_state:${key}`);
    await db
      .insert(oauthState)
      .values({ key, value })
      .onConflictDoUpdate({ target: oauthState.key, set: { value, createdAt: new Date() } });
    // Opportunistically clear abandoned sign-ins.
    await db.delete(oauthState).where(lt(oauthState.createdAt, new Date(Date.now() - STATE_TTL_MS)));
  },
  async get(key: string) {
    const db = await getDb();
    const [row] = await db.select().from(oauthState).where(eq(oauthState.key, key));
    if (!row) return undefined;
    if (row.createdAt.getTime() < Date.now() - STATE_TTL_MS) {
      await db.delete(oauthState).where(eq(oauthState.key, key));
      return undefined;
    }
    return JSON.parse(decrypt(row.value, `oauth_state:${key}`)) as NodeSavedState;
  },
  async del(key: string) {
    const db = await getDb();
    await db.delete(oauthState).where(eq(oauthState.key, key));
  },
};

export const sessionStore: NodeSavedSessionStore = {
  async set(sub: string, session: NodeSavedSession) {
    const db = await getDb();
    const value = encrypt(JSON.stringify(session), `oauth_session:${sub}`);
    await db
      .insert(oauthSession)
      .values({ sub, value })
      .onConflictDoUpdate({ target: oauthSession.sub, set: { value, updatedAt: new Date() } });
  },
  async get(sub: string) {
    const db = await getDb();
    const [row] = await db.select().from(oauthSession).where(eq(oauthSession.sub, sub));
    if (!row) return undefined;
    return JSON.parse(decrypt(row.value, `oauth_session:${sub}`)) as NodeSavedSession;
  },
  async del(sub: string) {
    const db = await getDb();
    await db.delete(oauthSession).where(eq(oauthSession.sub, sub));
  },
};

/**
 * Cross-instance lock (Postgres advisory lock) so two Cloud Run instances
 * never refresh the same session's tokens at once.
 */
export const requestLock: RuntimeLock = async (name, fn) => {
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
};
