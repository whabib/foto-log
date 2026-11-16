import "server-only";
import { and, asc, count, eq } from "drizzle-orm";
import { cache } from "react";
import type { CurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fotologGroup, groupMember, member } from "@/lib/db/schema";

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
 * their standing afterwards; joining twice changes nothing.
 */
export async function joinGroup(user: CurrentUser, groupDid: string): Promise<MembershipStatus> {
  if (user.did === groupDid) throw new GroupError("A group can't join itself.");
  const group = await getGroup(groupDid);
  if (!group) throw new GroupError("That account isn't a group.");
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(groupMember).where(eq(groupMember.memberDid, user.did));
  if (n >= MAX_GROUPS_PER_MEMBER) {
    throw new GroupError(`You can be in up to ${MAX_GROUPS_PER_MEMBER} groups. Leave one to join another.`);
  }
  const status: MembershipStatus = group.joinPolicy === "open" ? "member" : "pending";
  const [row] = await db
    .insert(groupMember)
    .values({ groupDid, memberDid: user.did, status })
    .onConflictDoNothing()
    .returning({ status: groupMember.status });
  if (row) return status;
  return (await currentStatus(groupDid, user.did)) ?? status;
}

async function currentStatus(groupDid: string, memberDid: string): Promise<MembershipStatus | null> {
  const db = await getDb();
  const [row] = await db
    .select({ status: groupMember.status })
    .from(groupMember)
    .where(and(eq(groupMember.groupDid, groupDid), eq(groupMember.memberDid, memberDid)))
    .limit(1);
  return row ? (row.status === "member" ? "member" : "pending") : null;
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
