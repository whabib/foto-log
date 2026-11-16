import "server-only";
import { Agent } from "@atproto/api";
import type { CurrentUser } from "@/lib/auth";
import { baseUrl } from "@/lib/config";
import { resolveActor, type Actor } from "@/lib/identity";
import { primaryName } from "@/lib/fotolog-name-server";
import { getOAuthClient } from "@/lib/oauth/client";
import { fetchFromPds } from "@/lib/safe-fetch";
import {
  assertValidPhotoRecord,
  buildPhotoRecord,
  dateKeyFor,
  isValidTimeZone,
  MAX_IMAGE_BYTES,
  nextPhotoRecordKey,
  PHOTO_COLLECTION,
  photoRecordKey,
  type PhotoRecord,
} from "@/lib/photo-record";
import { buildPostText, graphemeLength, maxCaptionGraphemes } from "./text";
import { photoPath } from "./urls";

const POST_COLLECTION = "app.bsky.feed.post";
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ALT_GRAPHEMES = 1000;

/** A problem the user can fix or should be told about; `message` is shown to them. */
export class PhotoError extends Error {
  constructor(
    readonly code:
      | "invalid"
      | "already_posted"
      | "session_expired"
      | "not_found"
      | "forbidden",
    message: string,
    readonly path?: string,
  ) {
    super(message);
  }
}

export type PhotoInput = {
  image: Uint8Array;
  mimeType: string;
  width: number;
  height: number;
  caption: string;
  alt: string;
  timeZone: string;
};

export async function agentFor(did: string): Promise<Agent> {
  try {
    const client = await getOAuthClient();
    return new Agent(await client.restore(did));
  } catch (err) {
    console.warn("Could not restore OAuth session", { did, err });
    throw new PhotoError("session_expired", "Your sign-in has expired. Please sign in again.");
  }
}

function errorName(err: unknown): string | undefined {
  const e = err as { error?: unknown } | null;
  return typeof e?.error === "string" ? e.error : undefined;
}

async function recordExists(agent: Agent, did: string, collection: string, rkey: string) {
  try {
    await agent.com.atproto.repo.getRecord({ repo: did, collection, rkey });
    return true;
  } catch (err) {
    if (errorName(err) === "RecordNotFound") return false;
    throw err;
  }
}

/** Lexicon byte limits (UTF-8), which can bind before the grapheme limits. */
const MAX_POST_TEXT_BYTES = 3000;
const MAX_CAPTION_BYTES = 3000;
const MAX_ALT_BYTES = 10_000;
const utf8Length = (s: string) => new TextEncoder().encode(s).length;

/** The signed-in member: their handle, and their Fotolog name when it's their primary name. */
export type Identity = { did: string; handle: string | null; name: string | null };

/**
 * The user's current verified handle, looked up fresh rather than taken
 * from the session (the handle may have changed since sign-in). Falls back
 * to DID-based URLs if it can't be verified.
 */
export async function currentIdentity(user: CurrentUser): Promise<Identity> {
  const [actor, name] = await Promise.all([resolveActor(user.did), primaryName(user.did)]);
  return { did: user.did, handle: actor?.handle ?? null, name };
}

/** The page URL for a photo on `uploadDate`. */
export function photoUrlFor(identity: Identity, uploadDate: string): string {
  return `${baseUrl}${photoPath(identity, uploadDate)}`;
}

export function validatePhotoInput(identity: Identity, input: PhotoInput, uploadDate: string) {
  if (!ACCEPTED_TYPES.has(input.mimeType)) {
    throw new PhotoError("invalid", "Please choose a JPEG, PNG or WebP image.");
  }
  if (input.image.byteLength === 0 || input.image.byteLength > MAX_IMAGE_BYTES) {
    throw new PhotoError("invalid", "The image must be smaller than 1 MB.");
  }
  for (const n of [input.width, input.height]) {
    if (!Number.isInteger(n) || n < 1 || n > 10_000) {
      throw new PhotoError("invalid", "The image size looks wrong. Please try another photo.");
    }
  }
  if (!isValidTimeZone(input.timeZone)) {
    throw new PhotoError("invalid", "We couldn't tell your time zone. Please try again.");
  }
  const photoUrl = photoUrlFor(identity, uploadDate);
  const caption = input.caption.trim();
  const maxCaption = maxCaptionGraphemes(photoUrl);
  if (graphemeLength(caption) > maxCaption) {
    throw new PhotoError("invalid", `Captions can be up to ${maxCaption} characters.`);
  }
  if (
    utf8Length(caption) > MAX_CAPTION_BYTES ||
    utf8Length(buildPostText(caption, photoUrl).text) > MAX_POST_TEXT_BYTES
  ) {
    throw new PhotoError("invalid", "That caption is too long. Try a shorter one or fewer emoji.");
  }
  const alt = input.alt.trim();
  if (graphemeLength(alt) > MAX_ALT_GRAPHEMES || utf8Length(alt) > MAX_ALT_BYTES) {
    throw new PhotoError("invalid", `Alt text can be up to ${MAX_ALT_GRAPHEMES} characters.`);
  }
}

/**
 * Posts today's photo for `user`: uploads the image, creates the Bluesky
 * post that shares it, then the com.foto-log.photo record. Returns the
 * photo page path.
 */
export async function postPhoto(user: CurrentUser, input: PhotoInput): Promise<string> {
  const now = new Date();
  const uploadDate = isValidTimeZone(input.timeZone) ? dateKeyFor(now, input.timeZone) : "";
  const identity = await currentIdentity(user);
  validatePhotoInput(identity, input, uploadDate);
  const path = photoPath(identity, uploadDate);

  const agent = await agentFor(user.did);
  // One photo a day for now: the only possible key is -01.
  const firstKey = photoRecordKey(uploadDate, 1);
  const taken = await recordExists(agent, user.did, PHOTO_COLLECTION, firstKey);
  const rkey = nextPhotoRecordKey(uploadDate, taken ? [1] : []);
  if (!rkey) {
    throw new PhotoError("already_posted", "You've already posted a photo today.", path);
  }

  const { data: upload } = await agent.com.atproto.repo.uploadBlob(input.image, {
    encoding: input.mimeType,
  });
  const aspectRatio = { width: input.width, height: input.height };
  const alt = input.alt.trim();
  const caption = input.caption.trim();
  const { text, facets } = buildPostText(caption, `${baseUrl}${path}`);

  const { data: post } = await agent.com.atproto.repo.createRecord({
    repo: user.did,
    collection: POST_COLLECTION,
    record: {
      $type: POST_COLLECTION,
      text,
      facets,
      createdAt: now.toISOString(),
      embed: {
        $type: "app.bsky.embed.images",
        images: [{ image: upload.blob, alt, aspectRatio }],
      },
    },
  });

  try {
    const { record } = buildPhotoRecord({
      post: { uri: post.uri, cid: post.cid },
      image: upload.blob,
      alt: alt || undefined,
      aspectRatio,
      caption: caption || undefined,
      now,
      timeZone: input.timeZone,
    });
    // createRecord with an explicit key fails if the key exists, so two
    // uploads racing for the same day can't both succeed.
    const { data: created } = await agent.com.atproto.repo.createRecord({
      repo: user.did,
      collection: PHOTO_COLLECTION,
      rkey,
      record,
    });
    await updateIndex((index) => index.indexPhoto(user.did, rkey, created.cid, record));
  } catch (err) {
    // The write may have succeeded with the response lost, or failed because
    // another upload took this key. Read back before deleting anything.
    let savedPostUri: string | undefined;
    let saved = false;
    try {
      const { data } = await agent.com.atproto.repo.getRecord({
        repo: user.did,
        collection: PHOTO_COLLECTION,
        rkey,
      });
      saved = true;
      savedPostUri = (data.value as { post?: { uri?: unknown } }).post?.uri as string | undefined;
    } catch (readErr) {
      if (errorName(readErr) !== "RecordNotFound") {
        console.error("Photo write outcome unknown; keeping the Bluesky post", {
          uri: post.uri,
          err,
          readErr,
        });
        throw err;
      }
    }
    if (savedPostUri === post.uri) return path; // it was saved after all
    const postRkey = post.uri.split("/").pop()!;
    await agent.com.atproto.repo
      .deleteRecord({ repo: user.did, collection: POST_COLLECTION, rkey: postRkey })
      .catch((cleanupErr) =>
        console.error("Couldn't delete Bluesky post after failed photo write", {
          uri: post.uri,
          cleanupErr,
        }),
      );
    if (saved) {
      throw new PhotoError("already_posted", "You've already posted a photo today.", path);
    }
    throw err;
  }
  return path;
}

/** Whether `user` has posted on today's date in `timeZone`, and where. */
export async function todaysPhotoPath(user: CurrentUser, timeZone: string): Promise<string | null> {
  if (!isValidTimeZone(timeZone)) throw new PhotoError("invalid", "Unknown time zone.");
  const uploadDate = dateKeyFor(new Date(), timeZone);
  const actor = await resolveActor(user.did);
  if (!actor) return null;
  const photo = await fetchPhoto(actor, photoRecordKey(uploadDate, 1));
  return photo ? photoPath(actor, uploadDate) : null;
}

export type StoredPhoto = { uri: string; cid: string; rkey: string; record: PhotoRecord };

/** Reads and validates a photo record straight from the owner's PDS. Null if missing or invalid. */
export async function fetchPhoto(actor: Actor, rkey: string): Promise<StoredPhoto | null> {
  const url = new URL("/xrpc/com.atproto.repo.getRecord", actor.pds);
  url.searchParams.set("repo", actor.did);
  url.searchParams.set("collection", PHOTO_COLLECTION);
  url.searchParams.set("rkey", rkey);
  let body: { uri: string; cid: string; value: unknown };
  try {
    const res = await fetchFromPds(url);
    if (!res.ok) return null;
    body = await res.json();
  } catch (err) {
    console.warn("Couldn't read photo from PDS", { did: actor.did, rkey, err });
    return null;
  }
  try {
    const { jsonToLex } = await import("@atproto/lexicon");
    const record = jsonToLex(body.value);
    assertValidPhotoRecord(rkey, record);
    return { uri: body.uri, cid: body.cid, rkey, record };
  } catch (err) {
    console.warn("Invalid photo record", { uri: body.uri, err });
    return null;
  }
}

/**
 * Deletes `user`'s photo `rkey` and the Bluesky post that shares it, in one
 * atomic write.
 */
export async function deletePhoto(user: CurrentUser, rkey: string): Promise<void> {
  const agent = await agentFor(user.did);
  let record: PhotoRecord;
  try {
    const { data } = await agent.com.atproto.repo.getRecord({
      repo: user.did,
      collection: PHOTO_COLLECTION,
      rkey,
    });
    const { jsonToLex } = await import("@atproto/lexicon");
    const value = jsonToLex(data.value);
    assertValidPhotoRecord(rkey, value);
    record = value;
  } catch (err) {
    if (errorName(err) === "RecordNotFound") {
      throw new PhotoError("not_found", "That photo doesn't exist anymore.");
    }
    throw err;
  }

  const DELETE = "com.atproto.repo.applyWrites#delete" as const;
  const writes: { $type: typeof DELETE; collection: string; rkey: string }[] = [
    { $type: DELETE, collection: PHOTO_COLLECTION, rkey },
  ];
  const postMatch = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(record.post.uri);
  if (
    postMatch &&
    postMatch[1] === user.did &&
    (await recordExists(agent, user.did, POST_COLLECTION, postMatch[2]))
  ) {
    writes.push({
      $type: DELETE,
      collection: POST_COLLECTION,
      rkey: postMatch[2],
    });
  }
  await agent.com.atproto.repo.applyWrites({ repo: user.did, writes });
  await updateIndex((index) => index.unindexPhoto(user.did, rkey));
}

/**
 * Applies a change to the photo index. The index catches up from Jetstream
 * anyway, so a failure here only delays the change; it never fails the
 * write. Imported lazily: the index module imports this one.
 */
async function updateIndex(
  change: (index: typeof import("@/lib/photo-index-server")) => Promise<void>,
): Promise<void> {
  try {
    await change(await import("@/lib/photo-index-server"));
  } catch (err) {
    console.warn("Couldn't update the photo index; Jetstream will catch up", { err });
  }
}

/** Most listRecords pages to read for one listPhotos call, in case many records are invalid. */
const MAX_LIST_PAGES = 5;

/**
 * Lists `actor`'s photos straight from their PDS. Record keys start with the
 * date, so the default order is newest first. With `before`, only photos
 * older than that record key; with `after`, only newer ones, oldest first.
 * Records that don't validate are skipped, and further pages are read until
 * `limit` valid photos are found or the collection runs out.
 */
export async function listPhotos(
  actor: Actor,
  opts: { limit: number; before?: string; after?: string },
): Promise<StoredPhoto[]> {
  const { jsonToLex } = await import("@atproto/lexicon");
  const photos: StoredPhoto[] = [];
  // listRecords pages from the cursor: descending by key by default, or
  // ascending with reverse=true.
  let cursor = opts.after ?? opts.before;
  for (let page = 0; page < MAX_LIST_PAGES && photos.length < opts.limit; page++) {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", actor.pds);
    url.searchParams.set("repo", actor.did);
    url.searchParams.set("collection", PHOTO_COLLECTION);
    url.searchParams.set("limit", String(opts.limit - photos.length));
    if (cursor) url.searchParams.set("cursor", cursor);
    if (opts.after) url.searchParams.set("reverse", "true");
    let body: { cursor?: string; records?: { uri: string; cid: string; value: unknown }[] };
    try {
      const res = await fetchFromPds(url);
      if (!res.ok) break;
      body = await res.json();
    } catch (err) {
      console.warn("Couldn't list photos from PDS", { did: actor.did, err });
      break;
    }
    const records = body.records ?? [];
    for (const r of records) {
      const rkey = r.uri.split("/").pop() ?? "";
      try {
        const record = jsonToLex(r.value);
        assertValidPhotoRecord(rkey, record);
        photos.push({ uri: r.uri, cid: r.cid, rkey, record });
      } catch (err) {
        console.warn("Skipping invalid photo record", { uri: r.uri, err });
      }
    }
    if (records.length === 0 || !body.cursor || body.cursor === cursor) break;
    cursor = body.cursor;
  }
  return photos;
}

/**
 * Reads `actor`'s photo collection one page of 100 at a time, newest first,
 * calling `onPage` with each page's valid photos. Unlike listPhotos it throws
 * if a page can't be read, so a caller never mistakes a failure for the end.
 * Returns true if it reached the end, false if it stopped at `maxPages`.
 */
export async function scanPhotos(
  actor: Actor,
  maxPages: number,
  onPage: (photos: StoredPhoto[]) => Promise<void>,
): Promise<boolean> {
  const { jsonToLex } = await import("@atproto/lexicon");
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", actor.pds);
    url.searchParams.set("repo", actor.did);
    url.searchParams.set("collection", PHOTO_COLLECTION);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetchFromPds(url);
    if (!res.ok) throw new Error(`listRecords failed with ${res.status}`);
    const body = (await res.json()) as { cursor?: string; records?: { uri: string; cid: string; value: unknown }[] };
    const records = body.records ?? [];
    const photos: StoredPhoto[] = [];
    for (const r of records) {
      const rkey = r.uri.split("/").pop() ?? "";
      try {
        const record = jsonToLex(r.value);
        assertValidPhotoRecord(rkey, record);
        photos.push({ uri: r.uri, cid: r.cid, rkey, record });
      } catch {
        // Not a valid photo: left out, so the index drops it too.
      }
    }
    await onPage(photos);
    if (records.length === 0 || !body.cursor || body.cursor === cursor) return true;
    cursor = body.cursor;
  }
  return false;
}

/**
 * Up to `count` photos on each side of `rkey`: `older` newest first,
 * `newer` oldest first. The first of each is the prev/next photo.
 */
export async function photoNeighbors(
  actor: Actor,
  rkey: string,
  count = 1,
): Promise<{ older: StoredPhoto[]; newer: StoredPhoto[] }> {
  const [older, newer] = await Promise.all([
    listPhotos(actor, { limit: count, before: rkey }),
    listPhotos(actor, { limit: count, after: rkey }),
  ]);
  return { older, newer };
}
