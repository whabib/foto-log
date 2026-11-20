import { PHOTO_COLLECTION } from "@/lib/photo-record";

const POST_COLLECTION = "app.bsky.feed.post";

/**
 * Bluesky's public Jetstream instances, filtered to foto-log photos and
 * Bluesky posts (for members' post deletes). The first is tried first; the
 * rest are fallbacks when it can't be reached. Override with JETSTREAM_URL
 * (one URL, or several separated by commas).
 */
export const DEFAULT_JETSTREAM_URLS = [
  "wss://jetstream2.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-east.bsky.network/subscribe",
  "wss://jetstream1.us-west.bsky.network/subscribe",
  "wss://jetstream2.us-west.bsky.network/subscribe",
];

/** The Jetstream URLs to try, in order: JETSTREAM_URL's if set, otherwise the defaults. */
export function jetstreamBases(override: string | undefined): string[] {
  const urls = (override ?? "").split(",").map((u) => u.trim()).filter(Boolean);
  return urls.length > 0 ? urls : DEFAULT_JETSTREAM_URLS;
}

export function jetstreamUrl(base: string, cursorUs: number | null): string {
  const url = new URL(base);
  url.searchParams.set("wantedCollections", PHOTO_COLLECTION);
  url.searchParams.append("wantedCollections", POST_COLLECTION);
  if (cursorUs !== null) url.searchParams.set("cursor", String(cursorUs));
  return url.toString();
}

/** A change to a com.foto-log.photo record, from one Jetstream event. */
export type PhotoChange =
  | { kind: "put"; did: string; rkey: string; cid: string; record: unknown }
  | { kind: "delete"; did: string; rkey: string };

type JetstreamEvent = {
  did?: unknown;
  time_us?: unknown;
  kind?: unknown;
  commit?: {
    operation?: unknown;
    collection?: unknown;
    rkey?: unknown;
    cid?: unknown;
    record?: unknown;
  };
};

/** The event's time in microseconds, which is also its replay cursor, or null. */
export function eventTimeUs(event: unknown): number | null {
  const t = (event as JetstreamEvent | null)?.time_us;
  return typeof t === "number" && Number.isSafeInteger(t) && t > 0 ? t : null;
}

/** The photo change in a Jetstream event, or null for anything else. The record still needs validating. */
export function photoChange(event: unknown): PhotoChange | null {
  const e = event as JetstreamEvent | null;
  if (e?.kind !== "commit" || typeof e.did !== "string" || !e.commit) return null;
  const { operation, collection, rkey, cid, record } = e.commit;
  if (collection !== PHOTO_COLLECTION || typeof rkey !== "string") return null;
  if (operation === "delete") return { kind: "delete", did: e.did, rkey };
  if ((operation === "create" || operation === "update") && typeof cid === "string" && record) {
    return { kind: "put", did: e.did, rkey, cid, record };
  }
  return null;
}

/** The DID whose identity (handle or PDS) changed, for an identity event; null otherwise. */
export function identityChange(event: unknown): string | null {
  const e = event as JetstreamEvent | null;
  return e?.kind === "identity" && typeof e.did === "string" ? e.did : null;
}

/** The deleted Bluesky post in a Jetstream event, or null for anything else. */
export function postDelete(event: unknown): { did: string; rkey: string } | null {
  const e = event as JetstreamEvent | null;
  if (e?.kind !== "commit" || typeof e.did !== "string" || !e.commit) return null;
  const { operation, collection, rkey } = e.commit;
  if (operation !== "delete" || collection !== POST_COLLECTION || typeof rkey !== "string") return null;
  return { did: e.did, rkey };
}
