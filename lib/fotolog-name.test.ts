import { describe, expect, it } from "vitest";
import { looksLikeName, nameProblem, normalizeName } from "./fotolog-name";

describe("normalizeName", () => {
  it("trims, drops a leading @ and lowercases", () => {
    expect(normalizeName("  @Cypher ")).toBe("cypher");
    expect(normalizeName("CYPHER")).toBe("cypher");
  });
});

describe("nameProblem", () => {
  it("accepts letters, digits and underscores", () => {
    expect(nameProblem("warren")).toBeNull();
    expect(nameProblem("w_k_2026")).toBeNull();
    expect(nameProblem("2fast")).toBeNull();
    expect(nameProblem("a".repeat(32))).toBeNull();
  });
  it("rejects bad lengths", () => {
    expect(nameProblem("ab")).toMatch(/3 to 32/);
    expect(nameProblem("a".repeat(33))).toMatch(/3 to 32/);
  });
  it("rejects a leading underscore", () => {
    expect(nameProblem("_warren")).toMatch(/underscore/);
  });
  it("rejects dots, hyphens and other characters", () => {
    expect(nameProblem("warren.nyc")).toMatch(/letters, numbers/);
    expect(nameProblem("war-ren")).toMatch(/letters, numbers/);
    expect(nameProblem("wärren")).toMatch(/letters, numbers/);
  });
  it("rejects reserved names, with or without underscores", () => {
    expect(nameProblem("settings")).toMatch(/reserved/);
    expect(nameProblem("foto_log")).toMatch(/reserved/);
    expect(nameProblem("fo_to_log")).toMatch(/reserved/);
  });
});

describe("looksLikeName", () => {
  it("is false for handles and DIDs", () => {
    expect(looksLikeName("alice.bsky.social")).toBe(false);
    expect(looksLikeName("did:plc:abc")).toBe(false);
    expect(looksLikeName("alice")).toBe(true);
  });
});
