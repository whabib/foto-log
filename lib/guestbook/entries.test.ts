import { describe, expect, it } from "vitest";
import {
  allowRules,
  applyGate,
  buildGuestbook,
  parseGuestbook,
  parsePostUri,
  parseThreadReplies,
  WHO_CAN_SIGN_CHOICES,
  whoCanSign,
} from "./entries";

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
  thread: { $type: "app.bsky.feed.defs#threadViewPost", post: { threadgate }, replies },
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
      gated: false,
      who: "everyone",
    });
  });

  it("is gated only by a threadgate that allows nobody", () => {
    expect(parseGuestbook(thread([], { record: { allow: [] } })).gated).toBe(true);
    expect(parseGuestbook(thread([], { record: { allow: [{ $type: "x" }] } })).gated).toBe(false);
  });
});

describe("buildGuestbook", () => {
  it("adds pending site entries the AppView hasn't indexed, without duplicates", () => {
    const indexed = parseThreadReplies(thread([reply(1, "2026-11-15T09:00:00Z"), reply(2, "2026-11-15T09:01:00Z")]));
    const pending = [
      parseThreadReplies(thread([reply(2, "2026-11-15T09:01:00Z")])).entries[0],
      parseThreadReplies(thread([reply(3, "2026-11-15T09:02:00Z")])).entries[0],
    ];
    const g = buildGuestbook(indexed, pending, 3);
    expect(g.entries.map((e) => e.text)).toEqual(["hello 1", "hello 2", "hello 3"]);
    expect(g.count).toBe(3);
    expect(g.closed).toBe(true);
    expect(g.gated).toBe(false);
  });
});

describe("parsePostUri", () => {
  it("splits a post URI into its repo DID and record key", () => {
    expect(parsePostUri("at://did:plc:abc123/app.bsky.feed.post/3kxyz")).toEqual({
      did: "did:plc:abc123",
      rkey: "3kxyz",
    });
  });

  it("rejects URIs that aren't posts, so the owner check can't be fooled", () => {
    expect(parsePostUri("at://did:plc:abc123/app.bsky.feed.like/3kxyz")).toBeNull();
    expect(parsePostUri("at://alice.test/app.bsky.feed.post/3kxyz")).toBeNull();
    expect(parsePostUri("at://did:plc:abc123/app.bsky.feed.post/3kxyz/extra")).toBeNull();
    expect(parsePostUri("https://bsky.app/profile/did:plc:abc123/post/3kxyz")).toBeNull();
  });
});

describe("whoCanSign", () => {
  const following = { $type: "app.bsky.feed.threadgate#followingRule" };
  it("reads the threadgate's allow list", () => {
    expect(whoCanSign(undefined)).toBe("everyone");
    expect(whoCanSign([])).toBe("nobody");
    expect(whoCanSign([following])).toBe("following");
    expect(whoCanSign([{ $type: "app.bsky.feed.threadgate#mentionRule" }])).toBe("custom");
    expect(whoCanSign([following, { $type: "app.bsky.feed.threadgate#mentionRule" }])).toBe("custom");
    expect(whoCanSign("nonsense")).toBe("custom");
  });

  it("reads followers and following rules in either order", () => {
    const followers = { $type: "app.bsky.feed.threadgate#followerRule" };
    expect(whoCanSign([followers])).toBe("followers");
    expect(whoCanSign([following, followers])).toBe("followers+following");
    expect(whoCanSign([followers, followers])).toBe("custom");
  });

  it("round-trips each choice through allowRules", () => {
    for (const who of WHO_CAN_SIGN_CHOICES) {
      expect(whoCanSign(allowRules(who))).toBe(who);
    }
  });

  it("comes from the post's threadgate", () => {
    const g = parseThreadReplies(thread([], { record: { allow: [following] } }));
    expect(g.who).toBe("following");
    expect(g.gated).toBe(false);
  });
});

describe("applyGate", () => {
  it("hides entries and applies reply rules we just wrote", () => {
    const t = parseThreadReplies(thread([reply(1, "2026-01-01T00:00:00Z"), reply(2, "2026-01-02T00:00:00Z")]));
    const g = applyGate(t, { allow: [], hiddenReplies: ["at://did:plc:u1/app.bsky.feed.post/r1"] });
    expect(g.entries.map((e) => e.uri)).toEqual(["at://did:plc:u2/app.bsky.feed.post/r2"]);
    expect(g.gated).toBe(true);
    expect(g.who).toBe("nobody");
    expect(buildGuestbook(g).closed).toBe(true);
  });

  it("reopens a guestbook set back to everyone", () => {
    const t = parseThreadReplies(thread([reply(1, "2026-01-01T00:00:00Z")], { record: { allow: [] } }));
    const g = applyGate(t, {});
    expect(g.gated).toBe(false);
    expect(buildGuestbook(g).closed).toBe(false);
  });
});

describe("hidden entries signed here", () => {
  it("aren't added back from the pending list", () => {
    const signed = parseThreadReplies(thread([reply(1, "2026-01-01T00:00:00Z")])).entries[0];
    const fromAppView = parseThreadReplies(
      thread([], { record: { hiddenReplies: ["at://did:plc:u1/app.bsky.feed.post/r1"] } }),
    );
    expect(buildGuestbook(fromAppView, [signed]).entries).toEqual([]);
    const justHidden = applyGate(parseThreadReplies(thread([])), {
      hiddenReplies: ["at://did:plc:u1/app.bsky.feed.post/r1"],
    });
    expect(buildGuestbook(justHidden, [signed]).count).toBe(0);
  });
});
