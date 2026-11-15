import { isValidDid, isValidHandle } from "@atproto/syntax";

/** Path of the page for one day's photo, e.g. /@alice.bsky.social/2026-10-14. */
export function photoPath(actor: { did: string; handle: string | null }, uploadDate: string): string {
  return actor.handle ? `/@${actor.handle}/${uploadDate}` : `/${actor.did}/${uploadDate}`;
}

/** Turns a URL segment like "@alice.bsky.social" or "did:plc:…" into a handle or DID, or null. */
export function parseActorParam(param: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(param);
  } catch {
    return null;
  }
  value = value.replace(/^@/, "");
  if (isValidDid(value)) return value;
  const handle = value.toLowerCase();
  return isValidHandle(handle) ? handle : null;
}

/** Full-size image URL on Bluesky's CDN. */
export function imageUrl(did: string, cid: string): string {
  return `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${cid}@jpeg`;
}

/**
 * A member page image (title image, wallpaper, profile photo) from the
 * member's repo, served by the Bluesky CDN like photos.
 */
export function memberImageUrl(did: string, cid: string): string {
  return imageUrl(did, cid);
}

/** The post's page on bsky.app. */
export function blueskyPostUrl(postUri: string): string | null {
  const m = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(postUri);
  return m ? `https://bsky.app/profile/${m[1]}/post/${m[2]}` : null;
}

/** Thumbnail image URL on Bluesky's CDN. */
export function thumbnailUrl(did: string, cid: string): string {
  return `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/${cid}@jpeg`;
}

/** Path of a member's member page, e.g. /@alice.bsky.social. */
export function memberPath(actor: { did: string; handle: string | null }): string {
  return actor.handle ? `/@${actor.handle}` : `/${actor.did}`;
}
