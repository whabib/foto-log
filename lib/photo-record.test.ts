import { BlobRef } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertValidPhotoRecord,
  buildPhotoRecord,
  dateKeyFor,
  isValidDateKey,
  isValidTimeZone,
  type PhotoRecordInput,
} from "./photo-record";

let image: BlobRef;
const post = {
  uri: "at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3l3qo2vutsw2b",
  cid: "bafyreig2fjxi3rptqdgylg7e5hmjl6mcke7rn2b6cugzlqq3i4zu6rq52q",
};

beforeAll(async () => {
  const cid = CID.create(1, raw.code, await sha256.digest(new Uint8Array([1, 2, 3])));
  image = new BlobRef(cid, "image/jpeg", 123_456);
});

function input(overrides: Partial<PhotoRecordInput> = {}): PhotoRecordInput {
  return {
    post,
    image,
    caption: "Sunset at the pier",
    now: new Date("2026-10-06T15:00:00Z"),
    timeZone: "America/New_York",
    ...overrides,
  };
}

describe("dateKeyFor", () => {
  it("rolls over at local midnight, not UTC midnight", () => {
    // New York is UTC-4 in October.
    expect(dateKeyFor(new Date("2026-10-06T03:59:59.999Z"), "America/New_York")).toBe("2026-10-05");
    expect(dateKeyFor(new Date("2026-10-06T04:00:00Z"), "America/New_York")).toBe("2026-10-06");
  });

  it("gives different dates for the same instant in different zones", () => {
    const instant = new Date("2026-10-05T23:30:00Z");
    expect(dateKeyFor(instant, "UTC")).toBe("2026-10-05");
    expect(dateKeyFor(instant, "Asia/Tokyo")).toBe("2026-10-06");
    expect(dateKeyFor(instant, "Pacific/Kiritimati")).toBe("2026-10-06"); // UTC+14
    expect(dateKeyFor(instant, "Pacific/Pago_Pago")).toBe("2026-10-05"); // UTC-11
  });

  it("handles half-hour offsets", () => {
    // India is UTC+5:30.
    expect(dateKeyFor(new Date("2026-10-05T18:29:59Z"), "Asia/Kolkata")).toBe("2026-10-05");
    expect(dateKeyFor(new Date("2026-10-05T18:30:00Z"), "Asia/Kolkata")).toBe("2026-10-06");
  });

  it("handles a DST change that skips midnight", () => {
    // Chile springs forward from 00:00 to 01:00 on 2026-09-06, so local midnight doesn't exist.
    expect(dateKeyFor(new Date("2026-09-06T03:59:59Z"), "America/Santiago")).toBe("2026-09-05");
    expect(dateKeyFor(new Date("2026-09-06T04:00:00Z"), "America/Santiago")).toBe("2026-09-06");
  });

  it("handles the day of a US DST change", () => {
    // Clocks go back at 02:00 on 2026-11-01; midnight is unaffected.
    expect(dateKeyFor(new Date("2026-11-01T03:59:59Z"), "America/New_York")).toBe("2026-10-31");
    expect(dateKeyFor(new Date("2026-11-01T04:00:00Z"), "America/New_York")).toBe("2026-11-01");
    expect(dateKeyFor(new Date("2026-11-02T04:59:59Z"), "America/New_York")).toBe("2026-11-01");
  });

  it("handles leap days and year boundaries", () => {
    expect(dateKeyFor(new Date("2028-02-29T12:00:00Z"), "UTC")).toBe("2028-02-29");
    expect(dateKeyFor(new Date("2027-01-01T04:59:59Z"), "America/New_York")).toBe("2026-12-31");
  });

  it("rejects unknown time zones and invalid dates", () => {
    expect(() => dateKeyFor(new Date(), "Mars/Olympus_Mons")).toThrow(RangeError);
    expect(() => dateKeyFor(new Date("nope"), "UTC")).toThrow(RangeError);
  });
});

describe("isValidDateKey", () => {
  it.each(["2026-10-06", "2028-02-29", "2026-12-31", "0099-01-01", "0004-02-29"])("accepts %s", (k) => {
    expect(isValidDateKey(k)).toBe(true);
  });
  it.each(["2026-13-01", "2026-02-30", "2027-02-29", "0099-02-29", "2026-1-01", "20261006", "2026-10-06T00:00", ""])(
    "rejects %j",
    (k) => {
      expect(isValidDateKey(k)).toBe(false);
    },
  );
});

describe("isValidTimeZone", () => {
  it("accepts IANA names and rejects junk", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Etc/GMT+5")).toBe(true);
    expect(isValidTimeZone("America/Argentina/Buenos_Aires")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});

describe("buildPhotoRecord", () => {
  it("builds a valid record keyed by the local upload date", () => {
    const { rkey, record } = buildPhotoRecord(
      input({ now: new Date("2026-10-06T02:00:00Z"), timeZone: "America/Los_Angeles" }),
    );
    expect(rkey).toBe("2026-10-05");
    expect(record).toMatchObject({
      $type: "com.foto-log.photo",
      uploadDate: "2026-10-05",
      displayDate: "2026-10-05",
      timeZone: "America/Los_Angeles",
      createdAt: "2026-10-06T02:00:00.000Z",
      caption: "Sunset at the pier",
    });
  });

  it("includes alt and aspectRatio when given, and omits empty optionals", () => {
    const { record } = buildPhotoRecord(
      input({ alt: "A pier at sunset", aspectRatio: { width: 4, height: 3 }, caption: "" }),
    );
    expect(record.alt).toBe("A pier at sunset");
    expect(record.aspectRatio).toEqual({ width: 4, height: 3 });
    expect("caption" in record).toBe(false);
  });

  it("allows a 300-grapheme caption but rejects 301", () => {
    expect(() => buildPhotoRecord(input({ caption: "a".repeat(300) }))).not.toThrow();
    expect(() => buildPhotoRecord(input({ caption: "a".repeat(301) }))).toThrow(/caption/);
  });

  it("counts graphemes, not code units, for the caption limit", () => {
    // Each camera emoji is one grapheme but two UTF-16 code units and four UTF-8 bytes.
    expect(() => buildPhotoRecord(input({ caption: "📷".repeat(300) }))).not.toThrow();
    expect(() => buildPhotoRecord(input({ caption: "📷".repeat(301) }))).toThrow(/caption/);
  });

  it("rejects an invalid time zone", () => {
    expect(() => buildPhotoRecord(input({ timeZone: "Nowhere/Special" }))).toThrow();
  });

  it("rejects fixed-offset time zones, which aren't IANA names", () => {
    for (const tz of ["+01:00", "-0530", "+00"]) {
      expect(isValidTimeZone(tz), tz).toBe(false);
      expect(() => buildPhotoRecord(input({ timeZone: tz })), tz).toThrow(RangeError);
    }
  });

  it("rejects a non-image blob", () => {
    const pdf = new BlobRef(image.ref, "application/pdf", 100);
    expect(() => buildPhotoRecord(input({ image: pdf }))).toThrow(/image/);
  });

  it("rejects an image over 1 MB", () => {
    const big = new BlobRef(image.ref, "image/jpeg", 1_000_001);
    expect(() => buildPhotoRecord(input({ image: big }))).toThrow(/image/);
  });

  it("rejects a bad post reference", () => {
    expect(() =>
      buildPhotoRecord(input({ post: { uri: "https://bsky.app/not-an-at-uri", cid: post.cid } })),
    ).toThrow(/post/);
  });
});

describe("assertValidPhotoRecord", () => {
  const good = () => buildPhotoRecord(input()).record;

  it("accepts a record built by buildPhotoRecord", () => {
    expect(() => assertValidPhotoRecord("2026-10-06", good())).not.toThrow();
  });

  it("rejects a record key that differs from uploadDate", () => {
    expect(() => assertValidPhotoRecord("2026-10-07", good())).toThrow(/Record key/);
  });

  it("rejects displayDate different from uploadDate (v1 rule)", () => {
    expect(() =>
      assertValidPhotoRecord("2026-10-06", { ...good(), displayDate: "2026-10-01" }),
    ).toThrow(/displayDate/);
  });

  it("rejects impossible dates", () => {
    const r = { ...good(), uploadDate: "2026-02-30", displayDate: "2026-02-30" };
    expect(() => assertValidPhotoRecord("2026-02-30", r)).toThrow(/uploadDate/);
  });

  it("rejects missing required fields", () => {
    for (const field of ["post", "image", "uploadDate", "displayDate", "timeZone", "createdAt"]) {
      const r: Record<string, unknown> = { ...good() };
      delete r[field];
      expect(() => assertValidPhotoRecord("2026-10-06", r), field).toThrow();
    }
  });

  it("rejects a createdAt that isn't a datetime", () => {
    expect(() =>
      assertValidPhotoRecord("2026-10-06", { ...good(), createdAt: "yesterday" }),
    ).toThrow(/createdAt/);
  });
});
