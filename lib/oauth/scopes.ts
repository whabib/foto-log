/**
 * OAuth scopes foto-log asks for, best first.
 *
 * 1. BUNDLE_SCOPE: foto-log's own record types through the published
 *    com.foto-log.authFull permission set, so new record types reach
 *    members without another sign-in (see docs/lexicon.md). Bluesky posts,
 *    threadgates and image uploads can't be in the set, so they're listed.
 * 2. GRANULAR_SCOPE: the same permissions listed one by one, for servers
 *    that can't resolve the permission set.
 * 3. FALLBACK_SCOPE: the broad `transition:generic` scope, for servers
 *    without granular scopes.
 *
 * A server that rejects a tier with `invalid_scope` gets the next one.
 */
export const PERMISSION_SET = "com.foto-log.authFull";

/** Permissions that can't be in the permission set: other namespaces and blobs. */
const OUTSIDE_SET = ["repo:app.bsky.feed.post", "repo:app.bsky.feed.threadgate", "blob:image/*"];

export const BUNDLE_SCOPE = ["atproto", `include:${PERMISSION_SET}`, ...OUTSIDE_SET].join(" ");

export const GRANULAR_SCOPE = [
  "atproto",
  "repo:com.foto-log.photo",
  "repo:com.foto-log.profile",
  "repo:com.foto-log.friend",
  ...OUTSIDE_SET,
].join(" ");

export const FALLBACK_SCOPE = "atproto transition:generic";

export const SCOPE_TIERS = [BUNDLE_SCOPE, GRANULAR_SCOPE, FALLBACK_SCOPE] as const;

/** Everything the client may request; declared in the client metadata. */
export const CLIENT_SCOPE = [...new Set(SCOPE_TIERS.flatMap((scope) => scope.split(" ")))].join(" ");
