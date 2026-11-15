import "server-only";
import { TtlCache } from "@/lib/ttl-cache";

const APPVIEW = "https://public.api.bsky.app";
const cache = new TtlCache<string, string | null>(5 * 60_000, 2000);

/**
 * The member's Bluesky avatar URL from the public AppView, or null if they
 * have none or it can't be fetched. Only Bluesky CDN URLs are returned.
 */
export async function blueskyAvatar(did: string): Promise<string | null> {
  const hit = cache.get(did);
  if (hit) return hit.value;
  let avatar: string | null = null;
  try {
    const url = new URL("/xrpc/app.bsky.actor.getProfile", APPVIEW);
    url.searchParams.set("actor", did);
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (res.ok) {
      const body = (await res.json()) as { avatar?: unknown };
      if (typeof body.avatar === "string" && body.avatar.startsWith("https://cdn.bsky.app/")) {
        avatar = body.avatar;
      }
    } else if (res.status >= 500) {
      return null; // don't cache server errors
    }
  } catch (err) {
    console.warn("Couldn't fetch Bluesky profile", { did, err });
    return null;
  }
  cache.set(did, avatar);
  return avatar;
}
