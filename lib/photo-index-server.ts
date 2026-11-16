import "server-only";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb, withTryLock } from "@/lib/db";
import { appState, member, photoIndex } from "@/lib/db/schema";
import { resolveActor } from "@/lib/identity";
import { DEFAULT_JETSTREAM_URL, eventTimeUs, identityChange, jetstreamUrl, photoChange } from "@/lib/jetstream";
import { assertValidPhotoRecord, type PhotoRecord } from "@/lib/photo-record";
import { scanPhotos } from "@/lib/photos/server";

const CURSOR_KEY = "jetstream_cursor";

/** Adds or replaces one photo in the index. */
export async function indexPhoto(did: string, rkey: string, cid: string, record: PhotoRecord): Promise<void> {
  const db = await getDb();
  const row = {
    did,
    rkey,
    cid,
    imageCid: record.image.ref.toString(),
    alt: record.alt ?? null,
    caption: record.caption ?? null,
    uploadDate: record.uploadDate,
    createdAt: new Date(record.createdAt),
    // The database's clock, which backfill reconciliation compares against.
    indexedAt: sql`now()`,
  };
  await db
    .insert(photoIndex)
    .values(row)
    .onConflictDoUpdate({ target: [photoIndex.did, photoIndex.rkey], set: row });
}

/** Removes one photo from the index. */
export async function unindexPhoto(did: string, rkey: string): Promise<void> {
  const db = await getDb();
  await db.delete(photoIndex).where(and(eq(photoIndex.did, did), eq(photoIndex.rkey, rkey)));
}

/** Indexes a record seen on Jetstream if it's a valid photo, or removes it if it isn't anymore. */
async function applyPut(did: string, rkey: string, cid: string, json: unknown): Promise<void> {
  const { jsonToLex } = await import("@atproto/lexicon");
  let record: unknown;
  try {
    record = jsonToLex(json);
    assertValidPhotoRecord(rkey, record);
  } catch {
    await unindexPhoto(did, rkey);
    return;
  }
  await indexPhoto(did, rkey, cid, record);
}

/** Most listRecords pages (of 100) to read in one backfill: decades of daily photos. */
const MAX_BACKFILL_PAGES = 200;

/**
 * Copies a member's photos from their repo into the index, and drops index
 * rows for photos that are gone from it. Returns false if the repo couldn't
 * be read; the member stays pending and is tried again later.
 */
export async function backfillMember(did: string): Promise<boolean> {
  const actor = await resolveActor(did);
  if (!actor) return false;
  const db = await getDb();
  // Rows written after this (by a post, a delete or Jetstream while the scan
  // runs) are newer than the scan, so reconciling leaves them alone.
  const [{ scanStart }] = (
    await db.execute<{ scanStart: string | Date }>(sql`SELECT now() AS "scanStart"`)
  ).rows;
  const seen = new Set<string>();
  let complete: boolean;
  try {
    complete = await scanPhotos(actor, MAX_BACKFILL_PAGES, async (photos) => {
      for (const p of photos) {
        seen.add(p.rkey);
        await indexPhoto(did, p.rkey, p.cid, p.record);
      }
    });
  } catch (err) {
    console.warn("Backfill couldn't read the repo", { did, err });
    return false;
  }
  if (complete) {
    const indexed = await db
      .select({ rkey: photoIndex.rkey })
      .from(photoIndex)
      .where(and(eq(photoIndex.did, did), lt(photoIndex.indexedAt, new Date(scanStart))));
    for (const { rkey } of indexed) {
      if (!seen.has(rkey)) {
        await db
          .delete(photoIndex)
          .where(and(eq(photoIndex.did, did), eq(photoIndex.rkey, rkey), lt(photoIndex.indexedAt, new Date(scanStart))));
      }
    }
  } else {
    // Only a repo far past one photo a day gets here: keep what was read, delete nothing.
    console.warn("Backfill stopped at its page limit", { did, pages: MAX_BACKFILL_PAGES });
  }
  await db.update(member).set({ backfilledAt: new Date(), handle: actor.handle }).where(eq(member.did, did));
  return true;
}

/** Records a member's current handle, as seen at sign-in or after a handle change. */
export async function rememberHandle(did: string, handle: string | null): Promise<void> {
  const db = await getDb();
  await db.update(member).set({ handle }).where(eq(member.did, did));
}

/** Re-resolves a member's handle after Jetstream reports an identity change. */
async function refreshHandle(did: string): Promise<void> {
  const actor = await resolveActor(did);
  // Don't clear a handle because resolution failed for a moment.
  if (actor) await rememberHandle(did, actor.handle);
}

/** How long sign-in waits for a new member's backfill; the indexer finishes it otherwise. */
const SIGN_IN_BACKFILL_MS = 3000;

/**
 * Copies a member's photos into the index on their first sign-in, so they
 * show up on the home page straight away. Gives up waiting after a few
 * seconds; the next indexer run picks it up.
 */
export async function backfillOnSignIn(did: string): Promise<void> {
  try {
    const db = await getDb();
    const [row] = await db.select({ at: member.backfilledAt }).from(member).where(eq(member.did, did)).limit(1);
    if (!row || row.at) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      backfillMember(did).catch((err) => console.warn("Sign-in backfill failed; the indexer will retry", { did, err })),
      new Promise((resolve) => {
        timer = setTimeout(resolve, SIGN_IN_BACKFILL_MS);
      }),
    ]);
    clearTimeout(timer);
  } catch (err) {
    console.warn("Sign-in backfill failed; the indexer will retry", { did, err });
  }
}

export type IndexedPhoto = {
  did: string;
  rkey: string;
  imageCid: string;
  alt: string | null;
  caption: string | null;
  uploadDate: string;
  createdAt: Date;
};

/**
 * The newest photo of each of the `limit` members who posted most recently,
 * newest first. Only members who have signed in to foto-log are listed.
 */
export async function recentPhotos(limit: number): Promise<IndexedPhoto[]> {
  const db = await getDb();
  const { rows } = await db.execute<{
    did: string;
    rkey: string;
    image_cid: string;
    alt: string | null;
    caption: string | null;
    upload_date: string;
    created_at: string | Date;
  }>(sql`
    SELECT * FROM (
      SELECT DISTINCT ON (p.did) p.did, p.rkey, p.image_cid, p.alt, p.caption, p.upload_date, p.created_at
      FROM ${photoIndex} p
      JOIN ${member} m ON m.did = p.did
      WHERE p.created_at <= now() + interval '5 minutes'
        -- Day pages show a day's -01 photo, so only those have a page to link to.
        AND p.rkey LIKE '%-01'
      ORDER BY p.did, p.created_at DESC
    ) latest
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({
    did: r.did,
    rkey: r.rkey,
    imageCid: r.image_cid,
    alt: r.alt,
    caption: r.caption,
    uploadDate: r.upload_date,
    createdAt: new Date(r.created_at),
  }));
}

/** How long one catch-up may keep reading Jetstream. */
const CATCH_UP_MS = 45_000;
/**
 * Stop when Jetstream has been quiet this long. Account and identity events
 * come through the photo filter too, so a healthy replay is never quiet for
 * long; quiet means something stalled, and the next run retries from the cursor.
 */
const IDLE_MS = 10_000;
/** How far back the first catch-up starts; older photos come from backfills. */
const FIRST_CURSOR_LOOKBACK_US = 60 * 60 * 1_000_000;

async function readCursor(): Promise<number | null> {
  const db = await getDb();
  const [row] = await db.select().from(appState).where(eq(appState.key, CURSOR_KEY)).limit(1);
  const n = row ? Number(row.value) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function writeCursor(us: number): Promise<void> {
  const db = await getDb();
  const value = String(us);
  await db
    .insert(appState)
    .values({ key: CURSOR_KEY, value })
    .onConflictDoUpdate({ target: appState.key, set: { value, updatedAt: new Date() } });
}

export type CatchUpResult = { events: number; changes: number; cursor: number; stoppedBy: "caught-up" | "quiet" | "time" | "error" };

/**
 * Reads foto-log photo changes from Jetstream since the saved cursor and
 * applies them to the index, then saves the new cursor. Stops once it
 * reaches the present, goes quiet, or runs out of time.
 */
async function catchUp(): Promise<CatchUpResult> {
  const startUs = Date.now() * 1000;
  const saved = await readCursor();
  let cursor = saved ?? startUs - FIRST_CURSOR_LOOKBACK_US;
  const db = await getDb();
  // Identity events cover the whole network; only members' handle changes matter.
  const members = new Set((await db.select({ did: member.did }).from(member)).map((m) => m.did));
  const ws = new WebSocket(jetstreamUrl(process.env.JETSTREAM_URL ?? DEFAULT_JETSTREAM_URL, cursor));
  let events = 0;
  let changes = 0;
  // Apply events one at a time, in order.
  let queue = Promise.resolve();
  // The first failed write. Later events are skipped so the cursor stops before it.
  let failed: { err: unknown } | undefined;

  const stoppedBy = await new Promise<CatchUpResult["stoppedBy"]>((resolve) => {
    let idle: ReturnType<typeof setTimeout> | undefined;
    const finish = (why: CatchUpResult["stoppedBy"]) => {
      clearTimeout(idle);
      clearTimeout(deadline);
      ws.close();
      resolve(why);
    };
    const deadline = setTimeout(() => finish("time"), CATCH_UP_MS);
    const touch = () => {
      clearTimeout(idle);
      idle = setTimeout(() => finish("quiet"), IDLE_MS);
    };
    ws.addEventListener("open", touch);
    ws.addEventListener("error", () => finish("error"));
    ws.addEventListener("close", () => finish("error"));
    ws.addEventListener("message", (msg) => {
      touch();
      let event: unknown;
      try {
        event = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      events++;
      const t = eventTimeUs(event);
      const change = photoChange(event);
      const handleChange = identityChange(event);
      const handleDid = handleChange && members.has(handleChange) ? handleChange : null;
      queue = queue
        .then(async () => {
          if (failed) return;
          if (change) {
            changes++;
            if (change.kind === "delete") await unindexPhoto(change.did, change.rkey);
            else await applyPut(change.did, change.rkey, change.cid, change.record);
          }
          if (handleDid) await refreshHandle(handleDid);
          if (t !== null && t > cursor) cursor = t;
        })
        .catch((err: unknown) => {
          failed ??= { err };
          finish("error");
        });
      if (t !== null && t >= startUs) finish("caught-up");
    });
  });

  await queue;
  // Saved only up to the last event applied, so the next run picks up from there.
  await writeCursor(cursor);
  if (failed) throw failed.err;
  return { events, changes, cursor, stoppedBy };
}

/** Members whose photos haven't been copied into the index yet, a few per tick. */
const BACKFILLS_PER_TICK = 5;

async function backfillPending(): Promise<number> {
  const db = await getDb();
  // In random order, so members whose repos can't be read don't hold up the rest.
  const pending = await db
    .select({ did: member.did })
    .from(member)
    .where(isNull(member.backfilledAt))
    .orderBy(sql`random()`)
    .limit(BACKFILLS_PER_TICK);
  let done = 0;
  for (const { did } of pending) {
    if (await backfillMember(did).catch(() => false)) done++;
  }
  return done;
}

/**
 * One run of the indexer: Jetstream catch-up, then a few pending member
 * backfills. Returns null if another instance is already running it.
 */
export async function indexTick(): Promise<{ catchUp: CatchUpResult; backfilled: number } | null> {
  return withTryLock("photo-index-tick", async () => {
    const result = await catchUp();
    const backfilled = await backfillPending();
    return { catchUp: result, backfilled };
  });
}
