import "server-only";
import { Agent } from "@atproto/api";
import type { CurrentUser } from "@/lib/auth";
import { baseUrl } from "@/lib/config";
import { resolveActor, type Actor } from "@/lib/identity";
import { getOAuthClient } from "@/lib/oauth/client";
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

async function agentFor(did: string): Promise<Agent> {
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

/** The page URL for `user`'s photo on `uploadDate`. */
export function photoUrlFor(user: CurrentUser, uploadDate: string): string {
  return `${baseUrl}${photoPath(user, uploadDate)}`;
}

export function validatePhotoInput(user: CurrentUser, input: PhotoInput, uploadDate: string) {
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
  const maxCaption = maxCaptionGraphemes(photoUrlFor(user, uploadDate));
  if (graphemeLength(input.caption.trim()) > maxCaption) {
    throw new PhotoError("invalid", `Captions can be up to ${maxCaption} characters.`);
  }
  if (graphemeLength(input.alt) > MAX_ALT_GRAPHEMES) {
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
  validatePhotoInput(user, input, uploadDate);
  const path = photoPath(user, uploadDate);

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
    await agent.com.atproto.repo.createRecord({
      repo: user.did,
      collection: PHOTO_COLLECTION,
      rkey,
      record,
    });
  } catch (err) {
    const postRkey = post.uri.split("/").pop()!;
    await agent.com.atproto.repo
      .deleteRecord({ repo: user.did, collection: POST_COLLECTION, rkey: postRkey })
      .catch((cleanupErr) =>
        console.error("Couldn't delete Bluesky post after failed photo write", {
          uri: post.uri,
          cleanupErr,
        }),
      );
    if (await recordExists(agent, user.did, PHOTO_COLLECTION, rkey).catch(() => false)) {
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
  return photo ? photoPath(user, uploadDate) : null;
}

export type StoredPhoto = { uri: string; cid: string; rkey: string; record: PhotoRecord };

/** Reads and validates a photo record straight from the owner's PDS. Null if missing or invalid. */
export async function fetchPhoto(actor: Actor, rkey: string): Promise<StoredPhoto | null> {
  const url = new URL("/xrpc/com.atproto.repo.getRecord", actor.pds);
  url.searchParams.set("repo", actor.did);
  url.searchParams.set("collection", PHOTO_COLLECTION);
  url.searchParams.set("rkey", rkey);
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as { uri: string; cid: string; value: unknown };
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
}
