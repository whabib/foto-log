import "server-only";
import { eq } from "drizzle-orm";
import type { CurrentUser } from "@/lib/auth";
import { getDb, withLock } from "@/lib/db";
import { member } from "@/lib/db/schema";
import {
  FRIEND_CARDS,
  FRIEND_COLLECTION,
  type FriendCard,
  friendFromRecord,
  friendRecordKey,
  newestCards,
  STARTER_FRIEND,
} from "@/lib/friends";
import { type Actor, resolveActor } from "@/lib/identity";
import { agentFor, listPhotos, PhotoError } from "@/lib/photos/server";
import { photoPath, thumbnailUrl } from "@/lib/photos/urls";
import { fetchFromPds } from "@/lib/safe-fetch";
import { TtlCache } from "@/lib/ttl-cache";

/** Most listRecords pages (of 100) to read for one list. */
const MAX_LIST_PAGES = 10;
/** Most friends whose newest photo is read for the right column. */
const MAX_CARD_LOOKUPS = 200;
const LOOKUP_CONCURRENCY = 12;

// A member's own changes clear their entry.
const listCache = new TtlCache<string, string[]>(60_000, 5000);
// Whether one member is on another's list, keyed "viewer subject".
const onListCache = new TtlCache<string, boolean>(60_000, 10_000);
// Each friend's newest photo, shared by every list they're on.
const cardCache = new TtlCache<string, FriendCard | null>(5 * 60_000, 10_000);

/**
 * The DIDs on `actor`'s Friends/Favorites list, read from their repo, in
 * record key order. Invalid records are skipped. Empty if it can't be read.
 */
export async function listFriends(actor: Actor, opts: { fresh?: boolean } = {}): Promise<string[]> {
  if (!opts.fresh) {
    const hit = listCache.get(actor.did);
    if (hit) return hit.value;
  }
  const { jsonToLex } = await import("@atproto/lexicon");
  const friends: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", actor.pds);
    url.searchParams.set("repo", actor.did);
    url.searchParams.set("collection", FRIEND_COLLECTION);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    let body: { cursor?: string; records?: { uri: string; value: unknown }[] };
    try {
      const res = await fetchFromPds(url);
      if (!res.ok) {
        console.warn("Couldn't list friends", { did: actor.did, status: res.status });
        return friends;
      }
      body = await res.json();
    } catch (err) {
      console.warn("Couldn't list friends", { did: actor.did, err });
      return friends;
    }
    const records = body.records ?? [];
    for (const r of records) {
      const did = friendFromRecord(r.uri.split("/").pop() ?? "", jsonToLex(r.value));
      if (did && did !== actor.did) friends.push(did);
    }
    if (records.length === 0 || !body.cursor || body.cursor === cursor) break;
    cursor = body.cursor;
  }
  listCache.set(actor.did, friends);
  return friends;
}

/**
 * Whether `did` is on `viewerDid`'s list. Reads that one record, so it's
 * right however long the list is. False if it can't be read.
 */
export async function isOnList(viewerDid: string, did: string): Promise<boolean> {
  const key = `${viewerDid} ${did}`;
  const hit = onListCache.get(key);
  if (hit) return hit.value;
  const rkey = friendRecordKey(did);
  const viewer = rkey ? await resolveActor(viewerDid) : null;
  if (!rkey || !viewer) return false;
  const url = new URL("/xrpc/com.atproto.repo.getRecord", viewer.pds);
  url.searchParams.set("repo", viewer.did);
  url.searchParams.set("collection", FRIEND_COLLECTION);
  url.searchParams.set("rkey", rkey);
  let onList: boolean;
  try {
    const res = await fetchFromPds(url);
    if (res.ok) {
      const body = (await res.json()) as { value: unknown };
      const { jsonToLex } = await import("@atproto/lexicon");
      onList = friendFromRecord(rkey, jsonToLex(body.value)) === did;
    } else if (res.status === 400) {
      onList = false; // RecordNotFound
    } else {
      console.warn("Couldn't read friend record", { viewer: viewerDid, did, status: res.status });
      return false;
    }
  } catch (err) {
    console.warn("Couldn't read friend record", { viewer: viewerDid, did, err });
    return false;
  }
  onListCache.set(key, onList);
  return onList;
}

/** The friend's newest photo as a right-column card, or null if they have none. */
async function friendCard(did: string): Promise<FriendCard | null> {
  const hit = cardCache.get(did);
  if (hit) return hit.value;
  const actor = await resolveActor(did);
  if (!actor) return null; // don't cache: resolution may be failing for a moment
  const [photo] = await listPhotos(actor, { limit: 1 });
  const card = photo
    ? {
        did,
        handle: actor.handle,
        path: photoPath(actor, photo.record.uploadDate),
        thumbnail: thumbnailUrl(did, photo.record.image.ref.toString()),
        alt: photo.record.alt ?? "",
        createdAt: photo.record.createdAt,
      }
    : null;
  cardCache.set(did, card);
  return card;
}

/** Runs `fn` over `items`, at most `limit` at a time. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * The right column of `owner`'s page: the friends on their list with the
 * newest photos, one card each, newest first. Reads each friend's newest
 * photo from their own PDS until the index (#6) can answer this.
 */
export async function friendCards(owner: Actor, count = FRIEND_CARDS): Promise<FriendCard[]> {
  const friends = (await listFriends(owner)).slice(0, MAX_CARD_LOOKUPS);
  const cards = await mapLimit(friends, LOOKUP_CONCURRENCY, (did) => friendCard(did).catch(() => null));
  return newestCards(cards, count);
}

function errorName(err: unknown): string | undefined {
  const e = err as { error?: unknown } | null;
  return typeof e?.error === "string" ? e.error : undefined;
}

function isScopeError(err: unknown): boolean {
  const e = err as { status?: unknown; error?: unknown; message?: unknown } | null;
  return e?.status === 403 || /scope/i.test(String(e?.error ?? "") + String(e?.message ?? ""));
}

function checkFriend(user: CurrentUser, did: string): string {
  const rkey = friendRecordKey(did);
  if (!rkey) throw new PhotoError("invalid", "That member can't be added to Friends/Favorites.");
  if (did === user.did) throw new PhotoError("invalid", "You can't add yourself to your Friends/Favorites.");
  return rkey;
}

async function writeList(user: CurrentUser, did: string, write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (err) {
    if (isScopeError(err)) {
      // Sessions from before this feature didn't ask to write the list.
      throw new PhotoError(
        "session_expired",
        "foto-log needs your permission to save your Friends/Favorites. Please sign in again.",
      );
    }
    throw err;
  } finally {
    listCache.delete(user.did);
    onListCache.delete(`${user.did} ${did}`);
  }
}

/** Adds `did` to `user`'s Friends/Favorites. Adding someone already on the list does nothing. */
export async function addFriend(user: CurrentUser, did: string): Promise<void> {
  const rkey = checkFriend(user, did);
  const agent = await agentFor(user.did);
  await writeList(user, did, async () => {
    try {
      // swapRecord: null only writes if the record doesn't exist yet.
      await agent.com.atproto.repo.putRecord({
        repo: user.did,
        collection: FRIEND_COLLECTION,
        rkey,
        swapRecord: null,
        record: { $type: FRIEND_COLLECTION, subject: did, createdAt: new Date().toISOString() },
      });
    } catch (err) {
      if (errorName(err) !== "InvalidSwap") throw err; // already on the list
    }
  });
}

/** Removes `did` from `user`'s Friends/Favorites. */
export async function removeFriend(user: CurrentUser, did: string): Promise<void> {
  const rkey = checkFriend(user, did);
  const agent = await agentFor(user.did);
  await writeList(user, did, async () => {
    await agent.com.atproto.repo.deleteRecord({ repo: user.did, collection: FRIEND_COLLECTION, rkey });
  });
}

/**
 * On a member's first sign-in, starts their Friends/Favorites with
 * @foto-log.com. Runs once per member: later sign-ins, or removing it,
 * don't add it again. If the add fails, it's tried again next sign-in.
 */
export async function welcomeNewMember(user: CurrentUser): Promise<void> {
  try {
    // One sign-in at a time per member, across servers, so an overlapping
    // first sign-in can't add @foto-log.com again after it's been removed.
    await withLock(`welcome:${user.did}`, async () => {
      const db = await getDb();
      const [known] = await db.select({ did: member.did }).from(member).where(eq(member.did, user.did)).limit(1);
      if (known) return;
      const starter = await resolveActor(STARTER_FRIEND);
      if (!starter) {
        console.warn("Couldn't resolve the starter friend", { handle: STARTER_FRIEND });
        return; // tried again next sign-in
      }
      if (starter.did !== user.did) await addFriend(user, starter.did);
      await db.insert(member).values({ did: user.did }).onConflictDoNothing();
    });
  } catch (err) {
    console.error("Couldn't welcome new member", { did: user.did, err });
  }
}
