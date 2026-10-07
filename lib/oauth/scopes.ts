/**
 * OAuth scopes foto-log asks for.
 *
 * We first ask for granular permissions: only the record types foto-log
 * writes, plus image uploads. If the user's authorization server doesn't
 * support granular scopes it rejects them with `invalid_scope`, and we
 * retry with the broad `transition:generic` scope instead.
 */
export const GRANULAR_SCOPE = [
  "atproto",
  "repo:com.foto-log.photo",
  "repo:app.bsky.feed.post",
  "repo:app.bsky.feed.threadgate",
  "blob:image/*",
].join(" ");

export const FALLBACK_SCOPE = "atproto transition:generic";

/** Everything the client may request; declared in the client metadata. */
export const CLIENT_SCOPE = [
  ...new Set([...GRANULAR_SCOPE.split(" "), ...FALLBACK_SCOPE.split(" ")]),
].join(" ");
