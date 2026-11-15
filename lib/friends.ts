import { isValidDid, isValidRecordKey } from "@atproto/syntax";
import * as Friend from "@/lib/lexicon/types/com/foto-log/friend";

export const FRIEND_COLLECTION = "com.foto-log.friend";

/** How many friends' photos the member page's right column shows. */
export const FRIEND_CARDS = 6;

/** The handle every new member starts their Friends/Favorites with. */
export const STARTER_FRIEND = "foto-log.com";

/**
 * The record key for `did` on a Friends/Favorites list: the DID itself, so
 * each member can be on a list only once. Null for DIDs that can't be a
 * record key (a did:web with a port, for example).
 */
export function friendRecordKey(did: string): string | null {
  return isValidDid(did) && isValidRecordKey(did) ? did : null;
}

/** The friend's DID from a com.foto-log.friend record, or null if the record is invalid. */
export function friendFromRecord(rkey: string, record: unknown): string | null {
  const result = Friend.validateRecord(record);
  if (!result.success) return null;
  const { subject } = result.value;
  return subject === rkey && friendRecordKey(subject) ? subject : null;
}

/**
 * A friend's newest photo, sorted for the right column. `createdAt` is when
 * it was uploaded.
 */
export type FriendCard = {
  did: string;
  handle: string | null;
  path: string;
  thumbnail: string;
  alt: string;
  createdAt: string;
};

/** The `count` friends with the newest photos, newest first. Friends without photos are left out. */
export function newestCards(cards: (FriendCard | null)[], count: number): FriendCard[] {
  return cards
    .filter((c): c is FriendCard => c !== null && !Number.isNaN(Date.parse(c.createdAt)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, count);
}

/** "23 minutes ago", as the original Fotolog showed it. */
export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const units: [number, string][] = [
    [365 * 24 * 3600, "year"],
    [30 * 24 * 3600, "month"],
    [7 * 24 * 3600, "week"],
    [24 * 3600, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [size, name] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${name}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}
