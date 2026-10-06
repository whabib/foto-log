import { describe, expect, it } from "vitest";
import { callbackErrorDetails, oauthErrorCode, parseSignInState } from "./client";

describe("parseSignInState", () => {
  it("reads the state we sent", () => {
    expect(parseSignInState('{"input":"alice.bsky.social","fallback":false}')).toEqual({
      input: "alice.bsky.social",
      fallback: false,
    });
  });

  it("ignores missing or malformed state", () => {
    expect(parseSignInState(null)).toBeNull();
    expect(parseSignInState("")).toBeNull();
    expect(parseSignInState("not json")).toBeNull();
    expect(parseSignInState('{"input":1,"fallback":false}')).toBeNull();
  });
});

describe("oauthErrorCode", () => {
  it("reads the OAuth error code from an error-shaped object", () => {
    expect(oauthErrorCode(Object.assign(new Error("x"), { error: "invalid_scope" }))).toBe("invalid_scope");
    expect(oauthErrorCode(new Error("x"))).toBeUndefined();
    expect(oauthErrorCode(null)).toBeUndefined();
  });
});

describe("callbackErrorDetails", () => {
  it("reads the error and app state from a callback error", () => {
    const err = Object.assign(new Error("rejected"), {
      params: new URLSearchParams({ error: "access_denied" }),
      state: '{"input":"x","fallback":false}',
    });
    expect(callbackErrorDetails(err)).toEqual({
      error: "access_denied",
      state: '{"input":"x","fallback":false}',
    });
  });

  it("returns null for other errors", () => {
    expect(callbackErrorDetails(new Error("boom"))).toBeNull();
    expect(callbackErrorDetails(undefined)).toBeNull();
  });
});
