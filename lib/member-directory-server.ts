import "server-only";
import { blueskyProfile } from "@/lib/bsky-profile";
import { getPool } from "@/lib/db";
import { formatLocation } from "@/lib/geo";
import { photoKeyPath, thumbnailUrl } from "@/lib/photos/urls";

/** Members per page of the directory. */
export const MEMBER_DIRECTORY_PAGE_SIZE = 30;

/** How the directory is ordered: by name, A to Z, or by newest photo first. */
export type MemberSort = "name" | "recent";

export function memberSortParam(value: string | string[] | undefined): MemberSort {
  return value === "recent" ? "recent" : "name";
}

export type DirectoryMember = {
  did: string;
  handle: string | null;
  /** The member's primary Fotolog name, if they have one. */
  name: string | null;
  /** Their Bluesky avatar. */
  avatar: string | null;
  /** Their location from their settings, if they set one. */
  location: string | null;
  /** Their newest photo, if they have any. */
  latest: { path: string; thumbnail: string; alt: string; createdAt: string } | null;
};

/**
 * One page of foto-log's members (not groups, not banned), and how many
 * there are: by name, A to Z (their Fotolog name if it's primary, else their
 * handle), or with `recent`, the newest photo first and members without
 * photos last.
 */
export async function memberDirectory(
  page: number,
  sort: MemberSort,
): Promise<{ members: DirectoryMember[]; total: number }> {
  const pool = await getPool();
  const visible = `NOT EXISTS (SELECT 1 FROM fotolog_group g WHERE g.did = m.did)
    AND NOT EXISTS (SELECT 1 FROM banned_member b WHERE b.did = m.did)`;
  const sortName = `lower(coalesce(CASE WHEN m.show_fotolog_name THEN m.fotolog_name END, m.handle, m.did))`;
  const order =
    sort === "recent"
      ? `p.created_at DESC NULLS LAST, ${sortName}, m.did`
      : `${sortName}, m.did`;
  const [{ rows }, { rows: totals }] = await Promise.all([
    pool.query<{
      did: string;
      handle: string | null;
      fotolog_name: string | null;
      show_fotolog_name: boolean | null;
      country: string | null;
      region: string | null;
      locality: string | null;
      rkey: string | null;
      image_cid: string | null;
      alt: string | null;
      created_at: Date | null;
    }>(
      `SELECT m.did, m.handle, m.fotolog_name, m.show_fotolog_name,
              s.country, s.region, s.locality,
              p.rkey, p.image_cid, p.alt, p.created_at
       FROM member m
       LEFT JOIN member_settings s ON s.did = m.did
       LEFT JOIN LATERAL (
         SELECT rkey, image_cid, alt, created_at FROM photo_index
         WHERE did = m.did AND created_at <= now() + interval '5 minutes'
         ORDER BY created_at DESC LIMIT 1
       ) p ON true
       WHERE ${visible}
       ORDER BY ${order}
       LIMIT $1 OFFSET $2`,
      [MEMBER_DIRECTORY_PAGE_SIZE, (page - 1) * MEMBER_DIRECTORY_PAGE_SIZE],
    ),
    pool.query<{ n: string }>(`SELECT count(*) AS n FROM member m WHERE ${visible}`),
  ]);
  const profiles = await Promise.all(rows.map((r) => blueskyProfile(r.did)));
  return {
    total: Number(totals[0].n),
    members: rows.map((r, i) => {
      const name = r.show_fotolog_name ? r.fotolog_name : null;
      const ref = { did: r.did, handle: r.handle, name };
      return {
        did: r.did,
        handle: r.handle,
        name,
        avatar: profiles[i].avatar,
        location: r.country ? formatLocation({ country: r.country, region: r.region, locality: r.locality }) : null,
        latest:
          r.rkey && r.image_cid && r.created_at
            ? {
                path: photoKeyPath(ref, r.rkey),
                thumbnail: thumbnailUrl(r.did, r.image_cid),
                alt: r.alt ?? "",
                createdAt: r.created_at.toISOString(),
              }
            : null,
      };
    }),
  };
}
