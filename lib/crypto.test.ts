import { describe, expect, it } from "vitest";
import { decrypt, encrypt, randomId, sign, unsign } from "./crypto";

describe("encrypt/decrypt", () => {
  it("round-trips", () => {
    const token = encrypt('{"refresh_token":"abc"}', "oauth_session:did:plc:x");
    expect(token.startsWith("v1.")).toBe(true);
    expect(token).not.toContain("refresh_token");
    expect(decrypt(token, "oauth_session:did:plc:x")).toBe('{"refresh_token":"abc"}');
  });

  it("uses a fresh IV each time", () => {
    expect(encrypt("same", "ctx")).not.toBe(encrypt("same", "ctx"));
  });

  it("refuses a value moved to another row", () => {
    const token = encrypt("secret", "oauth_session:did:plc:alice");
    expect(() => decrypt(token, "oauth_session:did:plc:mallory")).toThrow();
  });

  it("refuses tampered ciphertext", () => {
    const token = encrypt("secret", "ctx");
    const parts = token.split(".");
    const ct = Buffer.from(parts[3], "base64url");
    ct[0] ^= 1;
    parts[3] = ct.toString("base64url");
    expect(() => decrypt(parts.join("."), "ctx")).toThrow();
  });

  it("refuses unknown formats", () => {
    expect(() => decrypt("plaintext", "ctx")).toThrow(/Unrecognized/);
  });
});

describe("sign/unsign", () => {
  it("round-trips", () => {
    const id = randomId();
    expect(unsign(sign(id))).toBe(id);
  });

  it("rejects a changed value or signature", () => {
    const signed = sign("session-1");
    expect(unsign(signed.replace("session-1", "session-2"))).toBeNull();
    expect(unsign(`${signed}x`)).toBeNull();
    expect(unsign("session-1")).toBeNull();
    expect(unsign("")).toBeNull();
  });
});

describe("randomId", () => {
  it("is 32 random bytes, URL-safe", () => {
    const id = randomId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomId()).not.toBe(id);
  });
});
