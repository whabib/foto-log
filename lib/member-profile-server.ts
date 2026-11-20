import "server-only";
import type { BlobRef } from "@atproto/lexicon";
import type { CurrentUser } from "@/lib/auth";
import type { Actor } from "@/lib/identity";
import {
  type MemberImages,
  memberImagesFromRecord,
  NO_MEMBER_IMAGES,
  PROFILE_COLLECTION,
  PROFILE_RKEY,
  type ProfileImageField,
  type ProfileRecord,
} from "@/lib/member-profile";
import { MAX_IMAGE_BYTES } from "@/lib/photo-record";
import { agentFor, PhotoError } from "@/lib/photos/server";
import { fetchFromPds } from "@/lib/safe-fetch";
import { TtlCache } from "@/lib/ttl-cache";
import { log } from "@/lib/log";

// Read on every member page view; a member's own changes update it here.
const cache = new TtlCache<string, MemberImages>(60_000, 5000);

/** Reads a member's page images from their own repo. None if unset, unreadable or invalid. */
export async function getMemberImages(actor: Actor, opts: { fresh?: boolean } = {}): Promise<MemberImages> {
  if (!opts.fresh) {
    const hit = cache.get(actor.did);
    if (hit) return hit.value;
  }
  const url = new URL("/xrpc/com.atproto.repo.getRecord", actor.pds);
  url.searchParams.set("repo", actor.did);
  url.searchParams.set("collection", PROFILE_COLLECTION);
  url.searchParams.set("rkey", PROFILE_RKEY);
  let images = NO_MEMBER_IMAGES;
  try {
    const res = await fetchFromPds(url);
    if (res.ok) {
      const body = (await res.json()) as { value: unknown };
      const { jsonToLex } = await import("@atproto/lexicon");
      images = memberImagesFromRecord(jsonToLex(body.value));
    } else if (res.status !== 400) {
      // 400 is RecordNotFound: the member hasn't set any images.
      log.warn("Couldn't read member profile record", { did: actor.did, status: res.status });
      return NO_MEMBER_IMAGES;
    }
  } catch (err) {
    log.warn("Couldn't read member profile record", { did: actor.did, err });
    return NO_MEMBER_IMAGES;
  }
  cache.set(actor.did, images);
  return images;
}

export type ImageUpload = { bytes: Uint8Array; mimeType: string; width: number; height: number };

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function errorName(err: unknown): string | undefined {
  const e = err as { error?: unknown } | null;
  return typeof e?.error === "string" ? e.error : undefined;
}

function isScopeError(err: unknown): boolean {
  const e = err as { status?: unknown; error?: unknown; message?: unknown } | null;
  return e?.status === 403 || /scope/i.test(String(e?.error ?? "") + String(e?.message ?? ""));
}

/** One image to change: set it to `upload`, or clear it when `upload` is null. */
export type ImageChange = { field: ProfileImageField; upload: ImageUpload | null };

/**
 * Changes the member's com.foto-log.profile record: uploads an image and
 * points its field at it, or clears the field, and/or sets the wallpaper
 * mode. Other fields are kept. Retries if another change lands first.
 */
export async function setMemberImage(
  user: CurrentUser,
  change: ImageChange | null,
  extra: { wallpaperMode?: "tile" | "fill" } = {},
): Promise<void> {
  const upload = change?.upload ?? null;
  if (upload) {
    if (!ACCEPTED_TYPES.has(upload.mimeType)) {
      throw new PhotoError("invalid", "Please choose a JPEG, PNG or WebP image.");
    }
    if (upload.bytes.byteLength === 0 || upload.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new PhotoError("invalid", "The image must be smaller than 1 MB.");
    }
    for (const n of [upload.width, upload.height]) {
      if (!Number.isInteger(n) || n < 1 || n > 10_000) {
        throw new PhotoError("invalid", "The image size looks wrong. Please try another image.");
      }
    }
  }
  const agent = await agentFor(user.did);
  try {
    let blob: BlobRef | null = null;
    if (upload) {
      const { data } = await agent.com.atproto.repo.uploadBlob(upload.bytes, { encoding: upload.mimeType });
      blob = data.blob;
    }
    for (let attempt = 1; ; attempt++) {
      let current: Partial<ProfileRecord> = {};
      let cid: string | null = null;
      try {
        const { data } = await agent.com.atproto.repo.getRecord({
          repo: user.did,
          collection: PROFILE_COLLECTION,
          rkey: PROFILE_RKEY,
        });
        current = data.value as Partial<ProfileRecord>;
        cid = data.cid ?? null;
      } catch (err) {
        if (errorName(err) !== "RecordNotFound") throw err;
      }
      const next: Record<string, unknown> = { ...current, $type: PROFILE_COLLECTION };
      if (change && blob && upload) {
        next[change.field] = { image: blob, aspectRatio: { width: upload.width, height: upload.height } };
      } else if (change) {
        delete next[change.field];
      }
      if (extra.wallpaperMode) next.wallpaperMode = extra.wallpaperMode;
      next.updatedAt = new Date().toISOString();
      try {
        await agent.com.atproto.repo.putRecord({
          repo: user.did,
          collection: PROFILE_COLLECTION,
          rkey: PROFILE_RKEY,
          swapRecord: cid,
          record: next,
        });
      } catch (err) {
        if (errorName(err) === "InvalidSwap" && attempt < 3) continue;
        throw err;
      }
      cache.delete(user.did);
      return;
    }
  } catch (err) {
    if (isScopeError(err)) {
      // Sessions from before this feature didn't ask to write the profile record.
      throw new PhotoError(
        "session_expired",
        "foto-log needs your permission to save page images. Please sign in again.",
      );
    }
    throw err;
  }
}
