import "server-only";
import { listFriends } from "@/lib/friends-server";
import { eq } from "drizzle-orm";
import { getDb, getPool } from "@/lib/db";
import { bannedMember, siteAdmin } from "@/lib/db/schema";
import { resolveActor } from "@/lib/identity";
import { TtlCache } from "@/lib/ttl-cache";

/**
 * The site's built-in admins, by handle or DID. A handle is resolved to its
 * DID, so whoever controls the domain is the admin. These can't be removed
 * from the admin page; the admins they make there can.
 */
const BUILT_IN_ADMINS = ["foto-log.com"];

// Handle → DID, so the admin check doesn't resolve on every page.
const adminDids = new TtlCache<string, string | null>(10 * 60_000, 100);

async function adminDid(admin: string): Promise<string | null> {
  if (admin.startsWith("did:")) return admin;
  const hit = adminDids.get(admin);
  if (hit) return hit.value;
  const did = (await resolveActor(admin))?.did ?? null;
  // A failed lookup isn't kept, so it's tried again next time.
  if (did) adminDids.set(admin, did);
  return did;
}

async function isBuiltInAdmin(did: string): Promise<boolean> {
  const dids = await Promise.all(BUILT_IN_ADMINS.map((a) => adminDid(a).catch(() => null)));
  return dids.includes(did);
}

/** Whether `did` is a site admin, built in or made one on the admin page. */
export async function isAdmin(did: string): Promise<boolean> {
  if (await isBuiltInAdmin(did)) return true;
  const db = await getDb();
  const [row] = await db.select({ did: siteAdmin.did }).from(siteAdmin).where(eq(siteAdmin.did, did)).limit(1);
  return row !== undefined;
}

export class AdminError extends Error {}

/**
 * Makes `did` an admin, by the admin `byDid`, or with `admin` false stops
 * them being one. Banned members can't be made admins; built-in admins, and
 * the admin making the change, can't be removed.
 */
export async function setAdmin(byDid: string, did: string, admin: boolean): Promise<void> {
  const db = await getDb();
  if (admin) {
    const [banned] = await db.select({ did: bannedMember.did }).from(bannedMember).where(eq(bannedMember.did, did));
    if (banned) throw new AdminError("Lift the ban before making them an admin.");
    await db.insert(siteAdmin).values({ did, grantedBy: byDid }).onConflictDoNothing();
    return;
  }
  if (did === byDid) throw new AdminError("You can't remove yourself as an admin.");
  if (await isBuiltInAdmin(did)) throw new AdminError("This admin is built in and can't be removed here.");
  await db.delete(siteAdmin).where(eq(siteAdmin.did, did));
}

export type AdminMemberRow = {
  did: string;
  handle: string | null;
  fotologName: string | null;
  showFotologName: boolean;
  joinedAt: Date;
  photos: number;
  /** How many are on their Friends/Favorites list; null if their account couldn't be resolved. */
  following: number | null;
  banned: boolean;
  /** "built-in" for a built-in admin, "made" for one made on the admin page. */
  admin: "built-in" | "made" | null;
};

/** Members per page of the admin list: each row reads that member's repo. */
export const ADMIN_PAGE_SIZE = 50;

/** Repos read at once for the following counts. */
const CONCURRENCY = 8;

/** One page of every member, newest first, and how many there are in all. */
export async function adminMembers(page: number): Promise<{ rows: AdminMemberRow[]; total: number }> {
  const pool = await getPool();
  const [{ rows }, { rows: totals }] = await Promise.all([
    pool.query<{
      did: string;
      handle: string | null;
      fotolog_name: string | null;
      show_fotolog_name: boolean;
      joined_at: Date;
      photos: string;
      banned: boolean;
      made_admin: boolean;
    }>(
      `SELECT m.did, m.handle, m.fotolog_name, m.show_fotolog_name, m.joined_at,
              (SELECT count(*) FROM photo_index p WHERE p.did = m.did) AS photos,
              EXISTS (SELECT 1 FROM banned_member b WHERE b.did = m.did) AS banned,
              EXISTS (SELECT 1 FROM site_admin a WHERE a.did = m.did) AS made_admin
       FROM member m
       ORDER BY m.joined_at DESC, m.did
       LIMIT $1 OFFSET $2`,
      [ADMIN_PAGE_SIZE, (page - 1) * ADMIN_PAGE_SIZE],
    ),
    pool.query<{ n: string }>("SELECT count(*) AS n FROM member"),
  ]);
  const following = new Array<number | null>(rows.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const i = next++;
      following[i] = await followingCount(rows[i].did);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  const builtIn = await Promise.all(rows.map((r) => isBuiltInAdmin(r.did)));
  return {
    total: Number(totals[0].n),
    rows: rows.map((r, i) => ({
      did: r.did,
      handle: r.handle,
      fotologName: r.fotolog_name,
      showFotologName: r.show_fotolog_name,
      joinedAt: r.joined_at,
      photos: Number(r.photos),
      following: following[i],
      banned: r.banned,
      admin: builtIn[i] ? "built-in" : r.made_admin ? "made" : null,
    })),
  };
}

async function followingCount(did: string): Promise<number | null> {
  const actor = await resolveActor(did).catch(() => null);
  if (!actor) return null;
  return (await listFriends(actor)).length;
}
