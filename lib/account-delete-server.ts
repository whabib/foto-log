import "server-only";
import type { Agent } from "@atproto/api";
import { and, eq, gt, isNull, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";
import { getDb } from "@/lib/db";
import {
  closedMember,
  fotologGroup,
  groupMember,
  groupPost,
  groupPostClaim,
  member,
  memberSettings,
  oauthSession,
  photoIndex,
  siteAdmin,
  userSession,
} from "@/lib/db/schema";
import { FRIEND_COLLECTION } from "@/lib/friends";
import { PROFILE_COLLECTION } from "@/lib/member-profile";
import { PHOTO_COLLECTION } from "@/lib/photo-record";

/** How long a deleted member's Fotolog name is held for them. */
export const NAME_HOLD_DAYS = 90;

/** The foto-log collections a member's repository holds, which a delete can remove. */
export const FOTOLOG_COLLECTIONS = [PHOTO_COLLECTION, FRIEND_COLLECTION, PROFILE_COLLECTION] as const;

export class DeleteAccountError extends Error {}

const holdStart = () => new Date(Date.now() - NAME_HOLD_DAYS * 24 * 60 * 60 * 1000);

/** Whether `did` deleted their foto-log and hasn't signed in since. Their pages are hidden. */
export const isClosed = cache(async (did: string): Promise<boolean> => {
  const db = await getDb();
  const [row] = await db.select({ did: closedMember.did }).from(closedMember).where(eq(closedMember.did, did)).limit(1);
  return row !== undefined;
});

/** Whether `name` (normalized) is held for a deleted member other than `did`. */
export async function isNameHeld(name: string, did?: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ did: closedMember.did })
    .from(closedMember)
    .where(and(eq(closedMember.fotologName, name), gt(closedMember.closedAt, holdStart())))
    .limit(1);
  return row !== undefined && row.did !== did;
}

/**
 * Deletes every foto-log record in `did`'s repository. Reads the first page
 * of each collection again after each delete, so it picks up where it left
 * off if it's run again after a failure.
 */
export async function deleteFotologRecords(agent: Agent, did: string): Promise<number> {
  const DELETE = "com.atproto.repo.applyWrites#delete" as const;
  let deleted = 0;
  for (const collection of FOTOLOG_COLLECTIONS) {
    for (;;) {
      const { data } = await agent.com.atproto.repo.listRecords({ repo: did, collection, limit: 100 });
      if (data.records.length === 0) break;
      const writes = data.records.flatMap((r) => {
        const rkey = r.uri.split("/").pop();
        return rkey ? [{ $type: DELETE, collection, rkey }] : [];
      });
      if (writes.length === 0) break;
      await agent.com.atproto.repo.applyWrites({ repo: did, writes });
      deleted += writes.length;
    }
  }
  return deleted;
}

/**
 * Removes everything foto-log's database holds for `did`, signs them out on
 * every browser, and records that they left, holding their Fotolog name.
 * Bans are kept. Their OAuth tokens are revoked separately.
 */
export async function forgetMember(did: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    // The member row first: indexPhoto locks it, so no photo can be indexed after the index is cleared.
    const [row] = await tx.delete(member).where(eq(member.did, did)).returning({ name: member.fotologName });
    const name = row?.name ?? null;
    await tx
      .insert(closedMember)
      .values({ did, fotologName: name })
      // Deleting twice keeps the first hold; a delete after coming back starts a new one.
      .onConflictDoUpdate({
        target: closedMember.did,
        set: { fotologName: sql`excluded.fotolog_name`, closedAt: sql`now()` },
        setWhere: sql`excluded.fotolog_name IS NOT NULL`,
      });
    await tx.delete(userSession).where(eq(userSession.did, did));
    await tx.delete(memberSettings).where(eq(memberSettings.did, did));
    await tx.delete(photoIndex).where(eq(photoIndex.did, did));
    await tx.delete(groupMember).where(eq(groupMember.memberDid, did));
    // A group account: the group ends, and its members (cascade) and post credits go with it.
    await tx.delete(fotologGroup).where(eq(fotologGroup.did, did));
    await tx.delete(groupPost).where(eq(groupPost.groupDid, did));
    await tx.delete(groupPostClaim).where(or(eq(groupPostClaim.groupDid, did), eq(groupPostClaim.memberDid, did)));
    await tx.delete(siteAdmin).where(eq(siteAdmin.did, did));
  });
}

/**
 * When a deleted member signs in again: their pages show again, and if
 * they're back within NAME_HOLD_DAYS, their Fotolog name is theirs again.
 * Call after their member row exists; if it doesn't, throws, so the sign-in
 * fails and can be tried again.
 */
export async function reopenAccount(did: string): Promise<void> {
  const db = await getDb();
  await db.transaction(async (tx) => {
    const [closed] = await tx.select({ did: closedMember.did }).from(closedMember).where(eq(closedMember.did, did));
    if (!closed) return;
    const [known] = await tx.select({ did: member.did }).from(member).where(eq(member.did, did)).for("update");
    if (!known) throw new Error("A returning member has no member row yet");
    const [row] = await tx.delete(closedMember).where(eq(closedMember.did, did)).returning();
    if (!row?.fotologName || row.closedAt <= holdStart()) return;
    const other = alias(member, "other");
    await tx
      .update(member)
      .set({ fotologName: row.fotologName, showFotologName: true })
      .where(
        and(
          eq(member.did, did),
          isNull(member.fotologName),
          notExists(tx.select({ did: other.did }).from(other).where(eq(other.fotologName, row.fotologName))),
        ),
      );
  });
}

/** Drops `did`'s stored OAuth tokens, in case revoking them didn't. */
export async function forgetTokens(did: string): Promise<void> {
  const db = await getDb();
  await db.delete(oauthSession).where(eq(oauthSession.sub, did));
}
