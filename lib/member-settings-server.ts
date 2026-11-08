import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberSettings } from "@/lib/db/schema";
import type { MemberSettings } from "@/lib/member-settings";

// Member pages are public and read often; settings change rarely. Cache
// reads briefly per instance. Saves on this instance clear the entry; other
// instances catch up within the TTL.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: MemberSettings | null; expires: number }>();

/** A member's saved settings, or null if they've never saved any. No login needed. */
export async function getMemberSettings(did: string): Promise<MemberSettings | null> {
  const hit = cache.get(did);
  if (hit && hit.expires > Date.now()) return hit.value;
  const db = await getDb();
  const [row] = await db.select().from(memberSettings).where(eq(memberSettings.did, did));
  const value: MemberSettings | null = row
    ? {
        title: row.title,
        country: row.country,
        region: row.region,
        locality: row.locality,
        backgroundColor: row.backgroundColor,
        textColor: row.textColor,
      }
    : null;
  cache.set(did, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Saves settings for `did`. Callers must already have checked that the
 * signed-in user is `did` and validated the values.
 */
export async function saveMemberSettings(did: string, value: MemberSettings): Promise<void> {
  const db = await getDb();
  const now = new Date();
  await db
    .insert(memberSettings)
    .values({ did, ...value, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: memberSettings.did, set: { ...value, updatedAt: now } });
  cache.delete(did);
}

/** Clears `did`'s settings back to the defaults. */
export async function resetMemberSettings(did: string): Promise<void> {
  const db = await getDb();
  await db.delete(memberSettings).where(eq(memberSettings.did, did));
  cache.delete(did);
}
