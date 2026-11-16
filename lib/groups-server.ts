import "server-only";
import { and, asc, count, eq, lt, max, sql } from "drizzle-orm";
import { cache } from "react";
import type { CurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fotologGroup, groupMember, groupPost, groupPostClaim, member } from "@/lib/db/schema";

export type JoinPolicy = "open" | "approval";
export type Group = { did: string; joinPolicy: JoinPolicy };
export type MembershipStatus = "member" | "pending";

/** Most groups one member can belong to or have asked to join. */
export const MAX_GROUPS_PER_MEMBER = 100;

const asPolicy = (p: string): JoinPolicy => (p === "approval" ? "approval" : "open");

/** The group `did` is, or null if it's an ordinary account. */
export const getGroup = cache(async (did: string): Promise<Group | null> => {
  const db = await getDb();
  const [row] = await db.select().from(fotologGroup).where(eq(fotologGroup.did, did)).limit(1);
  return row ? { did: row.did, joinPolicy: asPolicy(row.joinPolicy) } : null;
});

/** Whether `did` is a group. Not cached, for code outside a request (sign-out). */
export async function isGroup(did: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db.select({ did: fotologGroup.did }).from(fotologGroup).where(eq(fotologGroup.did, did)).limit(1);
  return row !== undefined;
}

/**
 * Makes the account a group with `joinPolicy`, changes its policy, or with
 * null turns it back into an ordinary account and drops its members.
 * Turning approval off lets everyone waiting in.
 */
export async function setGroup(did: string, joinPolicy: JoinPolicy | null): Promise<void> {
  const db = await getDb();
  if (joinPolicy === null) {
    // Memberships go with it (ON DELETE CASCADE).
    await db.delete(fotologGroup).where(eq(fotologGroup.did, did));
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(fotologGroup)
      .values({ did, joinPolicy })
      .onConflictDoUpdate({ target: fotologGroup.did, set: { joinPolicy } });
    if (joinPolicy === "open") {
      await tx
        .update(groupMember)
        .set({ status: "member" })
        .where(and(eq(groupMember.groupDid, did), eq(groupMember.status, "pending")));
    }
  });
}

/** `memberDid`'s standing in the group, or null if they're not in it. */
export const membership = cache(async (groupDid: string, memberDid: string): Promise<MembershipStatus | null> => {
  const db = await getDb();
  const [row] = await db
    .select({ status: groupMember.status })
    .from(groupMember)
    .where(and(eq(groupMember.groupDid, groupDid), eq(groupMember.memberDid, memberDid)))
    .limit(1);
  if (!row) return null;
  return row.status === "member" ? "member" : "pending";
});

export class GroupError extends Error {}

/**
 * Joins `user` to the group, or asks to when it approves members. Returns
 * their standing afterwards; joining twice changes nothing. Reads the
 * policy under a lock on the group's row, so a policy change can't slip in
 * between, and counts the member's groups under a lock on the member, so
 * two joins at once can't pass the limit together.
 */
export async function joinGroup(user: CurrentUser, groupDid: string): Promise<MembershipStatus> {
  if (user.did === groupDid) throw new GroupError("A group can't join itself.");
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({ joinPolicy: fotologGroup.joinPolicy })
      .from(fotologGroup)
      .where(eq(fotologGroup.did, groupDid))
      .for("share");
    if (!group) throw new GroupError("That account isn't a group.");
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`group-join:${user.did}`}, 0))`);
    const [existing] = await tx
      .select({ status: groupMember.status })
      .from(groupMember)
      .where(and(eq(groupMember.groupDid, groupDid), eq(groupMember.memberDid, user.did)));
    if (existing) return existing.status === "member" ? "member" : "pending";
    const [{ n }] = await tx.select({ n: count() }).from(groupMember).where(eq(groupMember.memberDid, user.did));
    if (n >= MAX_GROUPS_PER_MEMBER) {
      throw new GroupError(`You can be in up to ${MAX_GROUPS_PER_MEMBER} groups. Leave one to join another.`);
    }
    const status: MembershipStatus = asPolicy(group.joinPolicy) === "open" ? "member" : "pending";
    await tx.insert(groupMember).values({ groupDid, memberDid: user.did, status });
    return status;
  });
}

/** Takes `memberDid` out of the group, or withdraws their request. */
export async function leaveGroup(groupDid: string, memberDid: string): Promise<void> {
  const db = await getDb();
  await db.delete(groupMember).where(and(eq(groupMember.groupDid, groupDid), eq(groupMember.memberDid, memberDid)));
}

/** Lets a waiting request in. Only the group itself (`user`) can. */
export async function approveRequest(user: CurrentUser, memberDid: string): Promise<void> {
  const db = await getDb();
  await db
    .update(groupMember)
    .set({ status: "member", createdAt: new Date() })
    .where(
      and(eq(groupMember.groupDid, user.did), eq(groupMember.memberDid, memberDid), eq(groupMember.status, "pending")),
    );
}

export type GroupMemberRow = {
  did: string;
  handle: string | null;
  name: string | null;
  status: MembershipStatus;
  since: Date;
};

/** Everyone in the group and everyone waiting, oldest first. */
export async function groupMembers(groupDid: string): Promise<GroupMemberRow[]> {
  const db = await getDb();
  const rows = await db
    .select({
      did: groupMember.memberDid,
      status: groupMember.status,
      since: groupMember.createdAt,
      handle: member.handle,
      fotologName: member.fotologName,
      showFotologName: member.showFotologName,
    })
    .from(groupMember)
    .leftJoin(member, eq(member.did, groupMember.memberDid))
    .where(eq(groupMember.groupDid, groupDid))
    .orderBy(asc(groupMember.createdAt));
  return rows.map((r) => ({
    did: r.did,
    handle: r.handle,
    name: r.showFotologName ? r.fotologName : null,
    status: r.status === "member" ? "member" : "pending",
    since: r.since,
  }));
}

/** How many members the group has, not counting requests. */
export const memberCount = cache(async (groupDid: string): Promise<number> => {
  const db = await getDb();
  const [{ n }] = await db
    .select({ n: count() })
    .from(groupMember)
    .where(and(eq(groupMember.groupDid, groupDid), eq(groupMember.status, "member")));
  return n;
});

/** The groups `memberDid` belongs to. */
export async function groupsOf(memberDid: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ did: groupMember.groupDid })
    .from(groupMember)
    .where(and(eq(groupMember.memberDid, memberDid), eq(groupMember.status, "member")));
  return rows.map((r) => r.did);
}

/** How long a claim may sit before it's taken as left behind by a crash. */
const CLAIM_TTL_MS = 10 * 60 * 1000;

/**
 * Claims the next record key of `uploadDate` on the group for `memberDid`:
 * one past `lastSequence` (the day's highest key in the repo) and past any
 * other post in progress. Returns the sequence number, "busy" if this
 * member is already posting to the group, or "full" when the day's keys
 * have run out. Release it with releaseGroupPost once the write is done.
 */
export async function claimGroupPost(
  groupDid: string,
  uploadDate: string,
  memberDid: string,
  lastSequence: number,
): Promise<number | "busy" | "full"> {
  const db = await getDb();
  await db
    .delete(groupPostClaim)
    .where(and(eq(groupPostClaim.groupDid, groupDid), lt(groupPostClaim.createdAt, new Date(Date.now() - CLAIM_TTL_MS))));
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db
      .select({ top: max(groupPostClaim.sequence) })
      .from(groupPostClaim)
      .where(and(eq(groupPostClaim.groupDid, groupDid), eq(groupPostClaim.uploadDate, uploadDate)));
    const sequence = Math.max(lastSequence, row?.top ?? 0) + 1;
    if (sequence > 99) return "full";
    try {
      await db.insert(groupPostClaim).values({ groupDid, uploadDate, memberDid, sequence });
      return sequence;
    } catch (err) {
      const constraint = (err as { constraint?: string; cause?: { constraint?: string } }).cause?.constraint ??
        (err as { constraint?: string }).constraint;
      if (constraint === "group_post_claim_sequence") continue; // someone took it: try the next
      if (constraint?.endsWith("_pk")) return "busy";
      throw err;
    }
  }
  return "busy";
}

/** Drops a claim made by claimGroupPost. */
export async function releaseGroupPost(groupDid: string, uploadDate: string, memberDid: string): Promise<void> {
  const db = await getDb();
  await db
    .delete(groupPostClaim)
    .where(
      and(
        eq(groupPostClaim.groupDid, groupDid),
        eq(groupPostClaim.uploadDate, uploadDate),
        eq(groupPostClaim.memberDid, memberDid),
      ),
    )
    .catch((err) => console.warn("Couldn't release a group post claim; it expires", { groupDid, err }));
}

/** Notes that `memberDid` posted the group's photo `rkey` through foto-log. */
export async function recordGroupPost(groupDid: string, rkey: string, memberDid: string): Promise<void> {
  const db = await getDb();
  await db
    .insert(groupPost)
    .values({ groupDid, rkey, memberDid })
    .onConflictDoUpdate({ target: [groupPost.groupDid, groupPost.rkey], set: { memberDid, createdAt: new Date() } });
}

/** Forgets who posted the group's photo `rkey`, when it wasn't saved or was deleted. */
export async function forgetGroupPost(groupDid: string, rkey: string): Promise<void> {
  const db = await getDb();
  await db.delete(groupPost).where(and(eq(groupPost.groupDid, groupDid), eq(groupPost.rkey, rkey)));
}

/** Whether foto-log posted the group's photo `rkey` for `memberDid`, so its credit can be shown. */
export async function isGroupPostBy(groupDid: string, rkey: string, memberDid: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ rkey: groupPost.rkey })
    .from(groupPost)
    .where(and(eq(groupPost.groupDid, groupDid), eq(groupPost.rkey, rkey), eq(groupPost.memberDid, memberDid)))
    .limit(1);
  return row !== undefined;
}
