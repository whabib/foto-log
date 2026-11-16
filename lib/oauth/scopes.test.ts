import { ScopePermissionsTransition } from "@atproto/oauth-scopes";
import { describe, expect, it } from "vitest";
import { CLIENT_SCOPE, FALLBACK_SCOPE, GRANULAR_SCOPE } from "./scopes";

describe("scopes", () => {
  const granular = new ScopePermissionsTransition(GRANULAR_SCOPE);

  it("lets foto-log write what it needs", () => {
    for (const collection of [
      "com.foto-log.photo",
      "com.foto-log.profile",
      "com.foto-log.friend",
      "app.bsky.feed.post",
      "app.bsky.feed.threadgate",
    ]) {
      for (const action of ["create", "update", "delete"] as const) {
        expect(granular.allowsRepo({ collection, action }), `${action} ${collection}`).toBe(true);
      }
    }
    expect(granular.allowsBlob({ mime: "image/jpeg" })).toBe(true);
    expect(granular.allowsBlob({ mime: "image/webp" })).toBe(true);
  });

  it("doesn't ask for anything else", () => {
    expect(granular.allowsRepo({ collection: "app.bsky.feed.like", action: "create" })).toBe(false);
    expect(granular.allowsRepo({ collection: "app.bsky.graph.follow", action: "create" })).toBe(false);
    expect(granular.allowsBlob({ mime: "video/mp4" })).toBe(false);
    expect(granular.hasTransitionGeneric).toBe(false);
  });

  it("declares every scope it may request in the client metadata", () => {
    const declared = new Set(CLIENT_SCOPE.split(" "));
    for (const s of [...GRANULAR_SCOPE.split(" "), ...FALLBACK_SCOPE.split(" ")]) {
      expect(declared.has(s), s).toBe(true);
    }
  });
});
