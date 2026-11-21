import "server-only";
import { TtlCache } from "@/lib/ttl-cache";
import { log } from "@/lib/log";

const APPVIEW = "https://public.api.bsky.app";

/** What foto-log shows from a Bluesky profile. */
export type BlueskyProfile = { avatar: string | null; description: string | null };

const NONE: BlueskyProfile = { avatar: null, description: null };
const cache = new TtlCache<string, BlueskyProfile>(5 * 60_000, 2000);

/**
 * The account's Bluesky avatar URL and profile description, from the public
 * AppView. Each is null if there's none or the profile can't be fetched.
 * Only Bluesky CDN avatar URLs are returned.
 */
export async function blueskyProfile(did: string): Promise<BlueskyProfile> {
  const hit = cache.get(did);
  if (hit) return hit.value;
  let profile = NONE;
  try {
    const url = new URL("/xrpc/app.bsky.actor.getProfile", APPVIEW);
    url.searchParams.set("actor", did);
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { avatar?: unknown; description?: unknown };
      const avatar =
        typeof body.avatar === "string" && body.avatar.startsWith("https://cdn.bsky.app/") ? body.avatar : null;
      const description =
        typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
      profile = { avatar, description };
    } else if (res.status >= 500) {
      return NONE; // don't cache server errors
    }
  } catch (err) {
    log.warn("Couldn't fetch Bluesky profile", { did, err });
    return NONE;
  }
  cache.set(did, profile);
  return profile;
}

/** The account's Bluesky avatar URL, or null. See blueskyProfile. */
export async function blueskyAvatar(did: string): Promise<string | null> {
  return (await blueskyProfile(did)).avatar;
}
