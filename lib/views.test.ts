import { describe, expect, it } from "vitest";
import {
  hourBucket,
  parseViewPayload,
  tokenTiming,
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
