import { describe, expect, it } from "vitest";
import { confirmsDelete } from "./account-delete";

describe("confirmsDelete", () => {
  const did = "did:plc:abc";
  it("takes the handle with or without @, in any case", () => {
    expect(confirmsDelete("alice.test", "alice.test", did)).toBe(true);
    expect(confirmsDelete(" @Alice.Test ", "alice.test", did)).toBe(true);
  });
  it("takes the DID", () => {
    expect(confirmsDelete("did:plc:abc", null, did)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(confirmsDelete("", "alice.test", did)).toBe(false);
    expect(confirmsDelete("@", null, did)).toBe(false);
    expect(confirmsDelete("bob.test", "alice.test", did)).toBe(false);
  });
});
