import { describe, expect, it } from "vitest";
import { blueskyPostUrl, displayName, friendsPath, imageUrl, memberPath, parseActorParam, photoPath, thumbnailUrl } from "./urls";

describe("photoPath", () => {
  it("uses @handle when there is one, otherwise the DID", () => {
    expect(photoPath({ did: "did:plc:abc", handle: "alice.bsky.social" }, "2026-10-14")).toBe(
      "/@alice.bsky.social/2026-10-14",
    );
    expect(photoPath({ did: "did:plc:abc", handle: null }, "2026-10-14")).toBe("/did:plc:abc/2026-10-14");
  });
});

describe("parseActorParam", () => {
  it("accepts @handle, handle, encoded @ and DIDs", () => {
    expect(parseActorParam("@alice.bsky.social")).toBe("alice.bsky.social");
    expect(parseActorParam("%40Alice.bsky.social")).toBe("alice.bsky.social");
    expect(parseActorParam("alice.bsky.social")).toBe("alice.bsky.social");
    expect(parseActorParam("did:plc:ewvi7nxzyoun6zhxrhs64oiz")).toBe("did:plc:ewvi7nxzyoun6zhxrhs64oiz");
  });

  it("accepts Fotolog names, case-insensitively, only with the @", () => {
    expect(parseActorParam("@warren")).toBe("warren");
    expect(parseActorParam("%40Cypher_1")).toBe("cypher_1");
    expect(parseActorParam("warren")).toBeNull();
    expect(parseActorParam("@_warren")).toBeNull();
  });

  it("rejects things that aren't handles or DIDs", () => {
    expect(parseActorParam("login")).toBeNull();
    expect(parseActorParam("@")).toBeNull();
    expect(parseActorParam("%E0%A4%A")).toBeNull();
    expect(parseActorParam("../etc")).toBeNull();
  });
});

describe("other URLs", () => {
  it("builds CDN and bsky.app URLs", () => {
    expect(imageUrl("did:plc:abc", "bafkrei123")).toBe(
      "https://cdn.bsky.app/img/feed_fullsize/plain/did:plc:abc/bafkrei123@jpeg",
    );
    expect(blueskyPostUrl("at://did:plc:abc/app.bsky.feed.post/3l3qo2vutsw2b")).toBe(
      "https://bsky.app/profile/did:plc:abc/post/3l3qo2vutsw2b",
    );
    expect(blueskyPostUrl("at://did:plc:abc/app.bsky.feed.like/3l3")).toBeNull();
  });
});

describe("memberPath and thumbnailUrl", () => {
  it("builds member page paths and CDN thumbnail URLs", () => {
    expect(memberPath({ did: "did:plc:abc", handle: "alice.bsky.social" })).toBe("/@alice.bsky.social");
    expect(memberPath({ did: "did:plc:abc", handle: null })).toBe("/did:plc:abc");
    expect(thumbnailUrl("did:plc:abc", "bafy")).toBe("https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:abc/bafy@jpeg");
  });
});

describe("Fotolog names in paths", () => {
  const m = { did: "did:plc:abc", handle: "alice.bsky.social", name: "alice" };
  it("uses the name when it's primary, without an @ in display", () => {
    expect(memberPath(m)).toBe("/@alice");
    expect(photoPath(m, "2026-10-14")).toBe("/@alice/2026-10-14");
    expect(friendsPath(m)).toBe("/@alice/friends");
    expect(displayName(m)).toBe("alice");
    expect(displayName({ did: "did:plc:abc", handle: "alice.bsky.social", name: null })).toBe("alice.bsky.social");
    expect(displayName({ did: "did:plc:abc", handle: null })).toBe("did:plc:abc");
  });
});
