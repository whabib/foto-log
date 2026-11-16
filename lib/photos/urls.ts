import { isValidDid, isValidHandle } from "@atproto/syntax";
import { looksLikeName } from "@/lib/fotolog-name";

/**
 * Who a link points to: the DID, the Bluesky handle, and the member's
 * Fotolog name when it's their primary name.
 */
export type MemberRef = { did: string; handle: string | null; name?: string | null };

/** The member's primary name as shown on foto-log: their Fotolog name, else their handle, else their DID. */
export function displayName(member: MemberRef): string {
  return member.name ?? member.handle ?? member.did;
}

/** The URL segment for a member: @name, @handle, or the DID. */
function memberSegment(member: MemberRef): string {
  if (member.name) return `@${member.name}`;
  return member.handle ? `@${member.handle}` : member.did;
}

/** Path of the page for one day's photo, e.g. /@alice.bsky.social/2026-10-14. */
export function photoPath(actor: MemberRef, uploadDate: string): string {
  return `/${memberSegment(actor)}/${uploadDate}`;
}

const RKEY_RE = /^(\d{4}-\d{2}-\d{2})-(\d{2})$/;

/**
 * Path of the page for the photo with record key `rkey`. A day's first
 * photo lives at the date (/@alice/2026-10-14); later ones, which groups
 * have, at the full key (/@alice/2026-10-14-03).
 */
export function photoKeyPath(actor: MemberRef, rkey: string): string {
  const m = RKEY_RE.exec(rkey);
  if (m && m[2] === "01") return photoPath(actor, m[1]);
  return `/${memberSegment(actor)}/${rkey}`;
}

/**
 * Turns a URL segment like "@alice.bsky.social", "@alice" or "did:plc:…"
 * into a handle, Fotolog name or DID, or null. Names have no dot, so they
 * can't be mistaken for handles.
 */
export function parseActorParam(param: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(param);
  } catch {
    return null;
  }
  const hadAt = value.startsWith("@");
  value = value.replace(/^@/, "");
  if (isValidDid(value)) return value;
  const handle = value.toLowerCase();
  // Names only with the @ (/@warren), so other one-word paths stay plain 404s.
  if (looksLikeName(handle)) return hadAt ? handle : null;
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
export function memberPath(actor: MemberRef): string {
  return `/${memberSegment(actor)}`;
}

/** Path of a member's full Friends/Favorites list, e.g. /@alice.bsky.social/friends. */
export function friendsPath(actor: MemberRef): string {
  return `${memberPath(actor)}/friends`;
}
