"use server";

import { isValidDid } from "@atproto/syntax";
import { getCurrentUser } from "@/lib/auth";
import { GroupError, joinGroup, leaveGroup, type MembershipStatus } from "@/lib/groups-server";
import { log } from "@/lib/log";

export type GroupActionState = { status: "ok"; membership: MembershipStatus | null } | { status: "error"; message: string };

/** Joins the signed-in member to a group (or asks to), or with `join` false leaves it or withdraws the request. */
export async function setMembershipAction(groupDid: string, join: boolean): Promise<GroupActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Please sign in again." };
  if (!isValidDid(groupDid)) return { status: "error", message: "Unknown group." };
  try {
    if (!join) {
      await leaveGroup(groupDid, user.did);
      return { status: "ok", membership: null };
    }
    return { status: "ok", membership: await joinGroup(user, groupDid) };
  } catch (err) {
    if (err instanceof GroupError) return { status: "error", message: err.message };
    log.error("Changing group membership failed", { did: user.did, groupDid, join, err });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
}
