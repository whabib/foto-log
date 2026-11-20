import "server-only";
import { type FriendCard, newestCards } from "@/lib/friends";
import { memberRows } from "@/lib/friends-server";
import { groupsOf } from "@/lib/groups-server";
import { log } from "@/lib/log";

/** How many groups the right column shows. */
const GROUP_CARDS = 6;

/** A card for each group `memberDid` belongs to, by the group's newest photo, newest first. */
export async function groupCards(memberDid: string, count = GROUP_CARDS): Promise<FriendCard[]> {
  try {
    const rows = await memberRows(await groupsOf(memberDid));
    return newestCards(
      rows.map((r) => r.latest),
      count,
    );
  } catch (err) {
    log.warn("Couldn't load groups", { did: memberDid, err });
    return [];
  }
}
