import "server-only";
import { safeFetchWrap } from "@atproto-labs/fetch-node";

const safeFetch = safeFetchWrap({
  // Blocks loopback, private and link-local destinations at connection time.
  ssrfProtection: true,
  allowIpHost: false,
  responseMaxSize: 1024 * 1024,
  timeout: 8000,
});

/**
 * Fetches a URL on a server chosen by an account (its PDS) without letting
 * that server point us at internal addresses: private IPs are refused and
 * redirects are errors.
 */
export function fetchFromPds(url: URL): Promise<Response> {
  return safeFetch(url, { redirect: "error", cache: "no-store" });
}
