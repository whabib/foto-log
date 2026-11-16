import { describe, expect, it } from "vitest";
import {
  type FriendCard,
  friendFromRecord,
  friendRecordKey,
  type FriendRow,
  newestCards,
  parseFriendSort,
  sortFriends,
  timeAgo,
} from "./friends";

const did = "did:plc:abcdefghijklmnopqrstuvwx";

describe("friendRecordKey", () => {
  it("uses the DID as the key", () => {
    expect(friendRecordKey(did)).toBe(did);
    expect(friendRecordKey("did:web:example.com")).toBe("did:web:example.com");
  });

  it("refuses what isn't a DID or can't be a key", () => {
    expect(friendRecordKey("alice.bsky.social")).toBeNull();
    expect(friendRecordKey("did:web:localhost%3A3000")).toBeNull();
  });
});

describe("friendFromRecord", () => {
  const record = { $type: "com.foto-log.friend", subject: did, createdAt: "2026-11-15T12:00:00.000Z" };

  it("reads the friend", () => {
    expect(friendFromRecord(did, record)).toBe(did);
  });

  it("refuses records whose key doesn't match, or that are invalid", () => {
    expect(friendFromRecord("did:plc:someoneelse", record)).toBeNull();
    expect(friendFromRecord(did, { ...record, subject: "alice" })).toBeNull();
    expect(friendFromRecord(did, { $type: "com.foto-log.friend", subject: did })).toBeNull();
  });
});

describe("newestCards", () => {
  const card = (n: number, createdAt: string): FriendCard => ({
    did: `did:plc:${n}`,
    handle: null,
    path: `/${n}`,
    thumbnail: "",
    alt: "",
    createdAt,
  });

  it("keeps the newest, newest first", () => {
    const cards = [
      card(1, "2026-11-01T00:00:00Z"),
      null,
      card(2, "2026-11-03T00:00:00Z"),
      card(3, "not a date"),
      card(4, "2026-11-02T00:00:00Z"),
    ];
    expect(newestCards(cards, 2).map((c) => c.did)).toEqual(["did:plc:2", "did:plc:4"]);
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  it("says how long ago", () => {
    expect(timeAgo("2026-11-15T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-15T11:37:00Z", now)).toBe("23 minutes ago");
    expect(timeAgo("2026-11-15T11:00:00Z", now)).toBe("1 hour ago");
    expect(timeAgo("2026-11-13T12:00:00Z", now)).toBe("2 days ago");
    expect(timeAgo("2026-10-01T12:00:00Z", now)).toBe("1 month ago");
    expect(timeAgo("2026-11-16T12:00:00Z", now)).toBe("just now");
  });
});

describe("sortFriends", () => {
  const row = (did: string, handle: string | null, createdAt?: string): FriendRow => ({
    did,
    handle,
    latest: createdAt ? { did, handle, path: "", thumbnail: "", alt: "", createdAt } : null,
  });
  const rows = [
    row("did:plc:c", "carol.bsky.social"),
    row("did:plc:z", null, "2026-11-15T00:00:00Z"),
    row("did:plc:a", "alice.bsky.social", "2026-11-01T00:00:00Z"),
    row("did:plc:b", "bob.example.com", "2026-11-10T00:00:00Z"),
  ];

  it("sorts by handle, members without one last", () => {
    expect(sortFriends(rows, "handle").map((r) => r.did)).toEqual(["did:plc:a", "did:plc:b", "did:plc:c", "did:plc:z"]);
  });

  it("sorts by newest photo, friends without photos last", () => {
    expect(sortFriends(rows, "recent").map((r) => r.did)).toEqual(["did:plc:z", "did:plc:b", "did:plc:a", "did:plc:c"]);
  });

  it("defaults to handle", () => {
    expect(parseFriendSort("recent")).toBe("recent");
    expect(parseFriendSort(undefined)).toBe("handle");
    expect(parseFriendSort(["recent"])).toBe("handle");
  });
});
