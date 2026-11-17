import "server-only";
import { blueskyProfile } from "@/lib/bsky-profile";
import { getPool } from "@/lib/db";
import type { JoinPolicy, MembershipStatus } from "@/lib/groups-server";
import { photoKeyPath, thumbnailUrl } from "@/lib/photos/urls";

/** Groups per page of the directory. */
export const DIRECTORY_PAGE_SIZE = 30;

export type DirectoryGroup = {
  did: string;
  handle: string | null;
  /** The group's primary Fotolog name, if it has one. */
  name: string | null;
  joinPolicy: JoinPolicy;
  members: number;
  /** The group's Bluesky profile description and avatar. */
  description: string | null;
  avatar: string | null;
  /** Its newest photo, if it has any. */
  latest: { path: string; thumbnail: string; alt: string; createdAt: string } | null;
  /** Where the viewer stands in it; null if they're not in it or not signed in. */
  viewer: MembershipStatus | null;
};

/**
 * One page of foto-log's groups, the most recently active first (by newest
 * photo, else when it became a group), and how many there are. Banned
 * groups are left out.
 */
export async function groupDirectory(
  page: number,
  viewerDid: string | null,
): Promise<{ groups: DirectoryGroup[]; total: number }> {
  const pool = await getPool();
  const visible = `NOT EXISTS (SELECT 1 FROM banned_member b WHERE b.did = g.did)`;
  const [{ rows }, { rows: totals }] = await Promise.all([
    pool.query<{
      did: string;
      join_policy: string;
      handle: string | null;
      fotolog_name: string | null;
      show_fotolog_name: boolean | null;
      members: string;
      rkey: string | null;
      image_cid: string | null;
      alt: string | null;
      created_at: Date | null;
      viewer: string | null;
    }>(
      `SELECT g.did, g.join_policy, m.handle, m.fotolog_name, m.show_fotolog_name,
              (SELECT count(*) FROM group_member gm WHERE gm.group_did = g.did AND gm.status = 'member') AS members,
              p.rkey, p.image_cid, p.alt, p.created_at,
              (SELECT v.status FROM group_member v WHERE v.group_did = g.did AND v.member_did = $3) AS viewer
       FROM fotolog_group g
       LEFT JOIN member m ON m.did = g.did
       LEFT JOIN LATERAL (
         SELECT rkey, image_cid, alt, created_at FROM photo_index
         WHERE did = g.did AND created_at <= now() + interval '5 minutes'
         ORDER BY created_at DESC LIMIT 1
       ) p ON true
       WHERE ${visible}
       ORDER BY coalesce(p.created_at, g.created_at) DESC, g.did
       LIMIT $1 OFFSET $2`,
      [DIRECTORY_PAGE_SIZE, (page - 1) * DIRECTORY_PAGE_SIZE, viewerDid ?? ""],
    ),
    pool.query<{ n: string }>(`SELECT count(*) AS n FROM fotolog_group g WHERE ${visible}`),
  ]);
  const profiles = await Promise.all(rows.map((r) => blueskyProfile(r.did)));
  return {
    total: Number(totals[0].n),
    groups: rows.map((r, i) => {
      const name = r.show_fotolog_name ? r.fotolog_name : null;
      const ref = { did: r.did, handle: r.handle, name };
      return {
        did: r.did,
        handle: r.handle,
        name,
        joinPolicy: r.join_policy === "approval" ? "approval" : "open",
        members: Number(r.members),
        description: profiles[i].description,
        avatar: profiles[i].avatar,
        latest:
          r.rkey && r.image_cid && r.created_at
            ? {
                path: photoKeyPath(ref, r.rkey),
                thumbnail: thumbnailUrl(r.did, r.image_cid),
                alt: r.alt ?? "",
                createdAt: r.created_at.toISOString(),
              }
            : null,
        viewer: r.viewer === "member" ? "member" : r.viewer === "pending" ? "pending" : null,
      };
    }),
  };
}
