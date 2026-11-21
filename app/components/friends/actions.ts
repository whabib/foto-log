"use server";

import { getCurrentUser } from "@/lib/auth";
import { addFriend, removeFriend } from "@/lib/friends-server";
import { PhotoError } from "@/lib/photos/server";
import { log } from "@/lib/log";

export type FriendState = { status: "done" } | { status: "error"; message: string; signIn?: boolean };

/** Adds `did` to, or removes them from, the signed-in member's Friends/Favorites. */
export async function setFriendAction(did: string, add: boolean): Promise<FriendState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Please sign in again.", signIn: true };
  try {
    await (add ? addFriend : removeFriend)(user, did);
  } catch (err) {
    if (err instanceof PhotoError) {
      return { status: "error", message: err.message, signIn: err.code === "session_expired" };
    }
    log.error("Friends/Favorites change failed", { did: user.did, friend: did, add, err });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  return { status: "done" };
}
