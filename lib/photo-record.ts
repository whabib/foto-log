import type { BlobRef } from "@atproto/lexicon";
import type { ComAtprotoRepoStrongRef } from "@/lib/lexicon";
import * as Photo from "@/lib/lexicon/types/com/foto-log/photo";

export const PHOTO_COLLECTION = "com.foto-log.photo";

/** Matches the image blob constraints in the lexicon, which validation doesn't enforce. */
export const MAX_IMAGE_BYTES = 1_000_000;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// IANA names look like "UTC", "America/New_York" or "Etc/GMT+5". This rules
// out fixed offsets such as "+01:00", which Intl also accepts.
const IANA_NAME_RE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;

/** True if `tz` is an IANA time zone name this runtime knows about. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64 || !IANA_NAME_RE.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** True if `key` is a real calendar date written as YYYY-MM-DD. */
export function isValidDateKey(key: string): boolean {
  const m = DATE_KEY_RE.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // setUTCFullYear, unlike Date.UTC, doesn't map years 0-99 to 1900-1999.
  const date = new Date(0);
  date.setUTCFullYear(y, mo - 1, d);
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * The calendar date (YYYY-MM-DD) of `instant` as seen in `timeZone`.
 * This is the uploadDate of a photo posted at that instant.
 */
export function dateKeyFor(instant: Date, timeZone: string): string {
  if (!isValidTimeZone(timeZone)) {
    throw new RangeError(`Unknown time zone: ${timeZone}`);
  }
  if (Number.isNaN(instant.getTime())) {
    throw new RangeError("Invalid date");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year").padStart(4, "0")}-${get("month")}-${get("day")}`;
}

/** Default number of photos an account may post per day. */
export const DEFAULT_DAILY_PHOTO_LIMIT = 1;

const MAX_SEQUENCE = 99;
const RECORD_KEY_RE = /^(\d{4}-\d{2}-\d{2})-(\d{2})$/;

/**
 * The record key for the `sequence`-th photo of `uploadDate`, e.g.
 * "2026-10-06-01". Sequence numbers run from 1 to 99.
 */
export function photoRecordKey(uploadDate: string, sequence: number): string {
  if (!isValidDateKey(uploadDate)) {
    throw new RangeError(`Invalid upload date: ${uploadDate}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new RangeError(`Sequence must be 1-${MAX_SEQUENCE}, got ${sequence}`);
  }
  return `${uploadDate}-${String(sequence).padStart(2, "0")}`;
}

/** Splits a record key like "2026-10-06-01" into its date and sequence, or null if malformed. */
export function parsePhotoRecordKey(
  rkey: string,
): { uploadDate: string; sequence: number } | null {
  const m = RECORD_KEY_RE.exec(rkey);
  if (!m || !isValidDateKey(m[1])) return null;
  const sequence = Number(m[2]);
  if (sequence < 1 || sequence > MAX_SEQUENCE) return null;
  return { uploadDate: m[1], sequence };
}

/**
 * The record key for a new photo on `uploadDate`, given the sequence numbers
 * already used that day, or null if the account has reached its daily
 * limit. The limit is enforced here in the app, not by the key format; a
 * higher limit just takes the next free sequence number.
 */
export function nextPhotoRecordKey(
  uploadDate: string,
  usedSequences: Iterable<number>,
  dailyLimit = DEFAULT_DAILY_PHOTO_LIMIT,
): string | null {
  const used = new Set(usedSequences);
  if (used.size >= dailyLimit) return null;
  for (let seq = 1; seq <= Math.min(dailyLimit, MAX_SEQUENCE); seq++) {
    if (!used.has(seq)) return photoRecordKey(uploadDate, seq);
  }
  return null;
}

export type PhotoRecordInput = {
  post: ComAtprotoRepoStrongRef.Main;
  image: BlobRef;
  alt?: string;
  aspectRatio?: { width: number; height: number };
  caption?: string;
  /** When the photo is being posted. */
  now: Date;
  /** The poster's IANA time zone. */
  timeZone: string;
  /** Which photo of the day this is (1-99). Always 1 while the daily limit is 1. */
  sequence?: number;
};

export type PhotoRecord = Photo.Record;

/**
 * Builds a com.foto-log.photo record and its record key, and validates it
 * against the lexicon. In v1 displayDate always equals uploadDate.
 */
export function buildPhotoRecord(input: PhotoRecordInput): {
  rkey: string;
  record: PhotoRecord;
} {
  const uploadDate = dateKeyFor(input.now, input.timeZone);
  const record: PhotoRecord = {
    $type: PHOTO_COLLECTION,
    post: { uri: input.post.uri, cid: input.post.cid },
    image: input.image,
    ...(input.alt ? { alt: input.alt } : {}),
    ...(input.aspectRatio
      ? {
          aspectRatio: {
            width: input.aspectRatio.width,
            height: input.aspectRatio.height,
          },
        }
      : {}),
    ...(input.caption ? { caption: input.caption } : {}),
    uploadDate,
    displayDate: uploadDate,
    timeZone: input.timeZone,
    createdAt: input.now.toISOString(),
  };
  const rkey = photoRecordKey(uploadDate, input.sequence ?? 1);
  assertValidPhotoRecord(rkey, record);
  return { rkey, record };
}

/**
 * Throws unless `record` is a valid com.foto-log.photo record for `rkey`:
 * it must pass the lexicon, use real calendar dates and a known time zone,
 * have a key of the form `<uploadDate>-NN` (NN = 01-99), and (in v1) have
 * displayDate === uploadDate.
 */
export function assertValidPhotoRecord(
  rkey: string,
  record: unknown,
): asserts record is PhotoRecord {
  const result = Photo.validateRecord(record);
  if (!result.success) {
    throw new Error(`Invalid photo record: ${result.error.message}`);
  }
  const r = result.value;
  if (!r.image.mimeType.startsWith("image/")) {
    throw new Error(`Invalid image type: ${r.image.mimeType}`);
  }
  if (r.image.size > MAX_IMAGE_BYTES) {
    throw new Error(`Invalid image size: ${r.image.size} bytes (max ${MAX_IMAGE_BYTES})`);
  }
  if (!isValidDateKey(r.uploadDate)) {
    throw new Error(`Invalid uploadDate: ${r.uploadDate}`);
  }
  if (!isValidDateKey(r.displayDate)) {
    throw new Error(`Invalid displayDate: ${r.displayDate}`);
  }
  const key = parsePhotoRecordKey(rkey);
  if (!key) {
    throw new Error(`Invalid record key ${rkey}: expected YYYY-MM-DD-NN with NN from 01 to 99`);
  }
  if (key.uploadDate !== r.uploadDate) {
    throw new Error(`Record key ${rkey} doesn't match uploadDate ${r.uploadDate}`);
  }
  if (r.displayDate !== r.uploadDate) {
    throw new Error("displayDate must equal uploadDate");
  }
  if (!isValidTimeZone(r.timeZone)) {
    throw new Error(`Unknown time zone: ${r.timeZone}`);
  }
}
