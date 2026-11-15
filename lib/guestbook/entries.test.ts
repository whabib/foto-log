import { describe, expect, it } from "vitest";
import { parseGuestbook } from "./entries";

const reply = (n: number, createdAt: string, extra: Record<string, unknown> = {}) => ({
  $type: "app.bsky.feed.defs#threadViewPost",
  post: {
    uri: `at://did:plc:u${n}/app.bsky.feed.post/r${n}`,
    cid: `c${n}`,
    author: { did: `did:plc:u${n}`, handle: `u${n}.test`, avatar: "https://cdn.bsky.app/img/avatar/x.jpg" },
    record: { text: `hello ${n}`, createdAt },
    indexedAt: createdAt,
    ...extra,
  },
});
const thread = (replies: unknown[], threadgate?: unknown) => ({
  thread: { $type: "app.bsky.feed.defs#threadViewPost", post: {}, replies, threadgate },
});

describe("parseGuestbook", () => {
  it("lists replies oldest first", () => {
    const g = parseGuestbook(thread([reply(2, "2026-11-15T10:00:00Z"), reply(1, "2026-11-15T09:00:00Z")]));
    expect(g.entries.map((e) => e.text)).toEqual(["hello 1", "hello 2"]);
    expect(g.count).toBe(2);
    expect(g.closed).toBe(false);
  });

  it("skips hidden, labeled, blocked and deleted replies", () => {
    const g = parseGuestbook(
      thread(
        [
          reply(1, "2026-11-15T09:00:00Z"),
          reply(2, "2026-11-15T09:01:00Z", { labels: [{ val: "!hide" }] }),
          reply(3, "2026-11-15T09:02:00Z"),
          { $type: "app.bsky.feed.defs#blockedPost", uri: "at://x" },
          { $type: "app.bsky.feed.defs#notFoundPost", uri: "at://y" },
        ],
        { record: { hiddenReplies: ["at://did:plc:u3/app.bsky.feed.post/r3"] } },
      ),
    );
    expect(g.entries.map((e) => e.author.handle)).toEqual(["u1.test"]);
  });

  it("is closed when a threadgate allows nobody, or the cap is reached", () => {
    expect(parseGuestbook(thread([], { record: { allow: [] } })).closed).toBe(true);
    const g = parseGuestbook(thread([1, 2, 3].map((n) => reply(n, `2026-11-15T0${n}:00:00Z`))), 2);
    expect(g.closed).toBe(true);
    expect(g.entries).toHaveLength(2);
    expect(g.count).toBe(3);
  });

  it("drops avatars not on Bluesky's CDN", () => {
    const r = reply(1, "2026-11-15T09:00:00Z");
    r.post.author.avatar = "https://evil.example/a.jpg";
    expect(parseGuestbook(thread([r])).entries[0].author.avatar).toBeNull();
  });

  it("handles a missing or deleted post", () => {
    expect(parseGuestbook({ thread: { $type: "app.bsky.feed.defs#notFoundPost" } })).toEqual({
      entries: [],
      count: 0,
      closed: false,
    });
  });
});
