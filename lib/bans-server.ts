import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { BAN_REASON_MAX } from "@/lib/ban-limits";
import { bannedMember } from "@/lib/db/schema";

export class BanError extends Error {}

/** Whether an admin has banned `did`. */
export const isBanned = cache(async (did: string): Promise<boolean> => {
  const db = await getDb();
  const [row] = await db.select({ did: bannedMember.did }).from(bannedMember).where(eq(bannedMember.did, did)).limit(1);
  return row !== undefined;
});

/**
 * Bans `did`, by the admin `adminDid`, for `reason`: signs them out
 * everywhere and revokes their tokens. Admins can't be banned. Banning twice
 * keeps the first ban's record.
 */
export async function banMember(adminDid: string, did: string, reason: string): Promise<void> {
  const why = reason.trim();
  if (!why) throw new BanError("Give a reason for the ban.");
  if (why.length > BAN_REASON_MAX) throw new BanError(`Keep the reason under ${BAN_REASON_MAX} characters.`);
  // Loaded here, so pages that only check bans don't pull in sign-in code.
  const [{ isAdmin }, { endAllSessions }] = await Promise.all([import("@/lib/admin-server"), import("@/lib/auth")]);
  if (did === adminDid || (await isAdmin(did))) throw new BanError("Admins can't be banned.");
  const db = await getDb();
  await db.insert(bannedMember).values({ did, bannedBy: adminDid, reason: why }).onConflictDoNothing();
  await endAllSessions(did);
}

/** Lifts a ban. They can sign in again, and their page and photos show again. */
export async function unbanMember(did: string): Promise<void> {
  const db = await getDb();
  await db.delete(bannedMember).where(eq(bannedMember.did, did));
}
