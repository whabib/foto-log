import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bannedMember, member, photoIndex, photoView } from "@/lib/db/schema";
import { randomId, sign, unsign } from "@/lib/crypto";
import { hourBucket, parseViewPayload, tokenTiming, UsedTokens, type ViewClaim, viewPayload } from "@/lib/views";

const usedTokens = new UsedTokens();

/** A signed, single-use token the photo page sends back to count one view of the photo. */
export function issueViewToken(did: string, rkey: string, now = Date.now()): string {
  return sign(viewPayload({ did, rkey, issuedAt: now, nonce: randomId().slice(0, 22) }));
}

export type ViewResult = "counted" | "invalid" | "early" | "expired" | "reused" | "unknown";

/**
 * Counts one view from a token, if the token is genuine, in its time
 * window, unused, and names a photo in the index.
 */
export async function recordView(token: string, now = Date.now()): Promise<ViewResult> {
  const payload = token.length <= 512 ? unsign(token) : null;
  const claim: ViewClaim | null = payload ? parseViewPayload(payload) : null;
  if (!claim) return "invalid";
  const timing = tokenTiming(claim.issuedAt, now);
  if (timing) return timing;
  if (!usedTokens.claim(claim, now)) return "reused";
  const db = await getDb();
  const bucket = hourBucket(now);
  // Only photos foto-log knows of; a deleted photo's page can't keep counting.
  // The index row is locked, so this can't interleave with deleting the photo
  // or the account: either the delete waits for this count and then removes
  // it, or this sees the photo is gone.
  const result = await db.execute(sql`
    INSERT INTO ${photoView} (member_did, photo_rkey, created_at, impressions)
    SELECT ${claim.did}, ${claim.rkey}, ${bucket}, 1
    WHERE EXISTS (
      SELECT 1 FROM ${photoIndex} WHERE ${photoIndex.did} = ${claim.did} AND ${photoIndex.rkey} = ${claim.rkey} FOR SHARE
    )
    ON CONFLICT (member_did, photo_rkey, created_at) DO UPDATE SET impressions = ${photoView.impressions} + 1`);
  return (result.rowCount ?? 0) > 0 ? "counted" : "unknown";
}

/** Deletes view rows for photos no longer in the index (deleted photos, closed accounts). */
export async function pruneViews(): Promise<number> {
  const db = await getDb();
  const result = await db.execute(sql`
    DELETE FROM ${photoView} v
    WHERE NOT EXISTS (
      SELECT 1 FROM ${photoIndex} p WHERE p.did = v.member_did AND p.rkey = v.photo_rkey
    )`);
  return result.rowCount ?? 0;
}

/** How many rows each admin report shows. */
export const REPORT_ROWS = 50;

export type PhotoViews = {
  did: string;
  rkey: string;
  handle: string | null;
  name: string | null;
  imageCid: string;
  uploadDate: string;
  views: number;
  banned: boolean;
};

export type MemberViews = {
  did: string;
  handle: string | null;
  name: string | null;
  photos: number;
  views: number;
  banned: boolean;
};

type PhotoRow = {
  did: string;
  rkey: string;
  handle: string | null;
  name: string | null;
  image_cid: string;
  upload_date: string;
  views: string | number;
  banned: boolean;
};

function toPhotoViews(r: PhotoRow): PhotoViews {
  return {
    did: r.did,
    rkey: r.rkey,
    handle: r.handle,
    name: r.name,
    imageCid: r.image_cid,
    uploadDate: r.upload_date,
    views: Number(r.views),
    banned: r.banned,
  };
}

/** The most viewed photos, all time or since `since` (compared with each hour's start). */
export async function viewsByPhoto(since: Date | null, limit = REPORT_ROWS): Promise<PhotoViews[]> {
  const db = await getDb();
  const window = since ? sql`AND v.created_at >= ${since}` : sql``;
  const { rows } = await db.execute<PhotoRow>(sql`
    SELECT v.member_did AS did, v.photo_rkey AS rkey, m.handle,
      CASE WHEN m.show_fotolog_name THEN m.fotolog_name END AS name,
      p.image_cid, p.upload_date, SUM(v.impressions) AS views,
      EXISTS (SELECT 1 FROM ${bannedMember} b WHERE b.did = v.member_did) AS banned
    FROM ${photoView} v
    JOIN ${photoIndex} p ON p.did = v.member_did AND p.rkey = v.photo_rkey
    LEFT JOIN ${member} m ON m.did = v.member_did
    WHERE TRUE ${window}
    GROUP BY v.member_did, v.photo_rkey, m.handle, m.show_fotolog_name, m.fotolog_name, p.image_cid, p.upload_date
    ORDER BY views DESC, v.member_did, v.photo_rkey
    LIMIT ${limit}`);
  return rows.map(toPhotoViews);
}

/** The members whose photos were viewed most, all time. */
export async function viewsByMember(limit = REPORT_ROWS): Promise<MemberViews[]> {
  const db = await getDb();
  const { rows } = await db.execute<{
    did: string;
    handle: string | null;
    name: string | null;
    photos: string | number;
    views: string | number;
    banned: boolean;
  }>(sql`
    SELECT v.member_did AS did, m.handle,
      CASE WHEN m.show_fotolog_name THEN m.fotolog_name END AS name,
      COUNT(DISTINCT v.photo_rkey) AS photos, SUM(v.impressions) AS views,
      EXISTS (SELECT 1 FROM ${bannedMember} b WHERE b.did = v.member_did) AS banned
    FROM ${photoView} v
    JOIN ${photoIndex} p ON p.did = v.member_did AND p.rkey = v.photo_rkey
    LEFT JOIN ${member} m ON m.did = v.member_did
    GROUP BY v.member_did, m.handle, m.show_fotolog_name, m.fotolog_name
    ORDER BY views DESC, v.member_did
    LIMIT ${limit}`);
  return rows.map((r) => ({
    did: r.did,
    handle: r.handle,
    name: r.name,
    photos: Number(r.photos),
    views: Number(r.views),
    banned: r.banned,
  }));
}
