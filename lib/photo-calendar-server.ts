import "server-only";
import { getPool } from "@/lib/db";

/** A photo as the calendar shows it. */
export type CalendarPhoto = { rkey: string; uploadDate: string; imageCid: string; alt: string };

/**
 * `did`'s photos on the days from `from` to `to` (inclusive, "YYYY-MM-DD"),
 * by day and then record key, from foto-log's photo index.
 */
export async function photosBetween(did: string, from: string, to: string): Promise<CalendarPhoto[]> {
  const pool = await getPool();
  const { rows } = await pool.query<{ rkey: string; upload_date: string; image_cid: string; alt: string | null }>(
    `SELECT rkey, upload_date, image_cid, alt FROM photo_index
     WHERE did = $1 AND upload_date >= $2 AND upload_date <= $3
     ORDER BY upload_date, rkey`,
    [did, from, to],
  );
  return rows.map((r) => ({ rkey: r.rkey, uploadDate: r.upload_date, imageCid: r.image_cid, alt: r.alt ?? "" }));
}

/** The first and last days `did` has photos on, or null if none. */
export async function photoDayRange(did: string): Promise<{ first: string; last: string } | null> {
  const pool = await getPool();
  const { rows } = await pool.query<{ first: string | null; last: string | null }>(
    `SELECT min(upload_date) AS first, max(upload_date) AS last FROM photo_index WHERE did = $1`,
    [did],
  );
  const { first, last } = rows[0] ?? {};
  return first && last ? { first, last } : null;
}
