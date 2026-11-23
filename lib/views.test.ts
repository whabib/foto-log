import { describe, expect, it } from "vitest";
import {
  hourBucket,
  parseViewPayload,
  tokenTiming,
  UsedTokens,
  VIEW_MIN_DELAY_MS,
  VIEW_TOKEN_TTL_MS,
  viewPayload,
} from "./views";

const DID = "did:plc:abc123abc123abc123abc123";
const claim = (nonce: string, rkey = "2026-11-22-01", issuedAt = 1_000) => ({ did: DID, rkey, issuedAt, nonce });

describe("view payload", () => {
  it("round-trips", () => {
    const c = claim("n1");
    expect(parseViewPayload(viewPayload(c))).toEqual(c);
  });

  it("rejects malformed payloads", () => {
    expect(parseViewPayload("")).toBeNull();
    expect(parseViewPayload("v2|did:plc:abc|2026-11-22-01|1000|n")).toBeNull();
    expect(parseViewPayload(`v1|not-a-did|2026-11-22-01|1000|n`)).toBeNull();
    expect(parseViewPayload(`v1|${DID}|bad rkey|1000|n`)).toBeNull();
    expect(parseViewPayload(`v1|${DID}|2026-11-22-01|soon|n`)).toBeNull();
    expect(parseViewPayload(`v1|${DID}|2026-11-22-01|1000|`)).toBeNull();
    expect(parseViewPayload(`v1|${DID}|2026-11-22-01|1000|n|extra`)).toBeNull();
  });
});

describe("tokenTiming", () => {
  it("needs the minimum delay and expires", () => {
    expect(tokenTiming(0, VIEW_MIN_DELAY_MS - 1)).toBe("early");
    expect(tokenTiming(0, VIEW_MIN_DELAY_MS)).toBeNull();
    expect(tokenTiming(0, VIEW_TOKEN_TTL_MS)).toBeNull();
    expect(tokenTiming(0, VIEW_TOKEN_TTL_MS + 1)).toBe("expired");
  });
});

describe("hourBucket", () => {
  it("floors to the UTC hour", () => {
    expect(hourBucket(Date.parse("2026-11-22T06:59:59.999Z")).toISOString()).toBe("2026-11-22T06:00:00.000Z");
  });
});

describe("UsedTokens", () => {
  it("counts a token only once", () => {
    const used = new UsedTokens();
    expect(used.claim(claim("a"), 5_000)).toBe(true);
    expect(used.claim(claim("a"), 6_000)).toBe(false);
    expect(used.claim(claim("b"), 6_000)).toBe(true);
  });

  it("turns new tokens away when full of valid ones, and keeps blocking used ones", () => {
    const used = new UsedTokens(10);
    for (let i = 0; i < 10; i++) expect(used.claim(claim(`n${i}`), 5_000)).toBe(true);
    expect(used.claim(claim("overflow"), 5_000)).toBe(false);
    expect(used.size).toBe(10);
    for (let i = 0; i < 10; i++) expect(used.claim(claim(`n${i}`), 5_000)).toBe(false);
  });

  it("forgets expired tokens to make room", () => {
    const used = new UsedTokens(10);
    for (let i = 0; i < 10; i++) used.claim(claim(`n${i}`), 5_000);
    const later = 1_000 + VIEW_TOKEN_TTL_MS + 1;
    expect(used.claim(claim("fresh", "2026-11-22-01", later - 5_000), later)).toBe(true);
    expect(used.size).toBe(1);
  });
});
