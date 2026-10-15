import "server-only";
import { extractPdsUrl } from "@atproto/oauth-client-node";
import { getOAuthClient } from "@/lib/oauth/client";

export type Actor = { did: string; handle: string | null; pds: URL };

/**
 * Resolves a handle or DID to the account's DID, verified handle and PDS.
 * Returns null if it can't be resolved.
 */
export async function resolveActor(actor: string): Promise<Actor | null> {
  try {
    const client = await getOAuthClient();
    const info = await client.identityResolver.resolve(actor);
    return {
      did: info.did,
      handle: info.handle === "handle.invalid" ? null : info.handle,
      pds: extractPdsUrl(info.didDoc),
    };
  } catch {
    return null;
  }
}
