import { describe, expect, it } from "vitest";
import { eventTimeUs, identityChange, jetstreamUrl, photoChange, postDelete } from "./jetstream";

const did = "did:plc:abcdefghijklmnopqrstuvwx";

describe("jetstreamUrl", () => {
  it("asks for photos and posts, from the cursor", () => {
    const url = new URL(jetstreamUrl("wss://js.example/subscribe", 1700000000000000));
    expect(url.searchParams.getAll("wantedCollections")).toEqual(["com.foto-log.photo", "app.bsky.feed.post"]);
    expect(url.searchParams.get("cursor")).toBe("1700000000000000");
    expect(new URL(jetstreamUrl("wss://js.example/subscribe", null)).searchParams.has("cursor")).toBe(false);
  });
});

describe("photoChange", () => {
  const commit = (operation: string, extra: object = {}) => ({
    did,
    time_us: 1700000000000000,
    kind: "commit",
    commit: { operation, collection: "com.foto-log.photo", rkey: "2026-11-15-01", ...extra },
  });

  it("reads creates, updates and deletes", () => {
    expect(photoChange(commit("create", { cid: "bafy", record: { a: 1 } }))).toEqual({
      kind: "put",
      did,
      rkey: "2026-11-15-01",
      cid: "bafy",
      record: { a: 1 },
    });
    expect(photoChange(commit("update", { cid: "bafy", record: { a: 1 } }))?.kind).toBe("put");
    expect(photoChange(commit("delete"))).toEqual({ kind: "delete", did, rkey: "2026-11-15-01" });
  });

  it("ignores everything else", () => {
    expect(photoChange({ did, kind: "identity", time_us: 1 })).toBeNull();
    expect(photoChange({ ...commit("create", { cid: "x", record: {} }), commit: { operation: "create", collection: "app.bsky.feed.post", rkey: "x", cid: "x", record: {} } })).toBeNull();
    expect(photoChange(commit("create"))).toBeNull();
    expect(photoChange(null)).toBeNull();
  });
});

describe("eventTimeUs", () => {
  it("reads the cursor", () => {
    expect(eventTimeUs({ time_us: 1700000000000000 })).toBe(1700000000000000);
    expect(eventTimeUs({ time_us: "1" })).toBeNull();
    expect(eventTimeUs({})).toBeNull();
  });
});

describe("identityChange", () => {
  it("returns the DID of an identity event", () => {
    expect(identityChange({ kind: "identity", did: "did:plc:abc", identity: { handle: "a.test" } })).toBe("did:plc:abc");
  });
  it("ignores other events", () => {
    expect(identityChange({ kind: "commit", did: "did:plc:abc" })).toBeNull();
    expect(identityChange({ kind: "account", did: "did:plc:abc" })).toBeNull();
    expect(identityChange(null)).toBeNull();
  });
});

describe("post deletes", () => {
  it("reads only post deletes", () => {
    const event = (operation: string, collection = "app.bsky.feed.post") => ({
      did,
      time_us: 1700000000000000,
      kind: "commit",
      commit: { operation, collection, rkey: "3abc" },
    });
    expect(postDelete(event("delete"))).toEqual({ did, rkey: "3abc" });
    expect(postDelete(event("create"))).toBeNull();
    expect(postDelete(event("delete", "com.foto-log.photo"))).toBeNull();
    expect(postDelete({ kind: "identity", did })).toBeNull();
  });
});
