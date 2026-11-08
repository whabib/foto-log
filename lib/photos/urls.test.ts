import { describe, expect, it } from "vitest";
import { blueskyPostUrl, imageUrl, parseActorParam, photoPath } from "./urls";

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
