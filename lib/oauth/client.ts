import "server-only";
import {
  buildAtprotoLoopbackClientMetadata,
  JoseKey,
  NodeOAuthClient,
  type OAuthClientMetadataInput,
} from "@atproto/oauth-client-node";
import { baseUrl, isProduction, secret } from "@/lib/config";
import { CLIENT_SCOPE, SCOPE_TIERS } from "./scopes";
import { requestLock, sessionStore, stateStore } from "./stores";

export const CALLBACK_PATH = "/oauth/callback";

function clientMetadata(): OAuthClientMetadataInput {
  if (!isProduction) {
    // Local dev: a loopback client needs no hosted metadata and no keys.
    return buildAtprotoLoopbackClientMetadata({
      scope: CLIENT_SCOPE,
      redirect_uris: [`${baseUrl}${CALLBACK_PATH}`],
    });
  }
  return {
    client_id: `${baseUrl}/oauth/client-metadata.json`,
    client_name: "foto-log",
    client_uri: baseUrl,
    redirect_uris: [`${baseUrl}${CALLBACK_PATH}`],
    scope: CLIENT_SCOPE,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    application_type: "web",
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    dpop_bound_access_tokens: true,
    jwks_uri: `${baseUrl}/oauth/jwks.json`,
  };
}

async function createClient(): Promise<NodeOAuthClient> {
  const keyset = isProduction
    ? [await JoseKey.fromImportable(secret("OAUTH_PRIVATE_KEY", ""))]
    : undefined;
  return new NodeOAuthClient({
    clientMetadata: clientMetadata(),
    keyset,
    stateStore,
    sessionStore,
    requestLock,
  });
}

const cache = globalThis as unknown as { fotologOAuth?: Promise<NodeOAuthClient> };

export function getOAuthClient(): Promise<NodeOAuthClient> {
  cache.fotologOAuth ??= createClient().catch((err) => {
    cache.fotologOAuth = undefined;
    throw err;
  });
  return cache.fotologOAuth;
}

/**
 * The OAuth error code (e.g. "invalid_scope") from an OAuthResponseError.
 * Checked by shape, not instanceof: bundling can load the error classes twice.
 */
export function oauthErrorCode(err: unknown): string | undefined {
  const code = (err as { error?: unknown } | null)?.error;
  return typeof code === "string" ? code : undefined;
}

/** The redirect parameters and app state of an OAuthCallbackError, if `err` is one. */
export function callbackErrorDetails(
  err: unknown,
): { error: string | null; state: string | undefined } | null {
  const e = err as { params?: unknown; state?: unknown } | null;
  if (!(e?.params instanceof URLSearchParams)) return null;
  return {
    error: e.params.get("error"),
    state: typeof e.state === "string" ? e.state : undefined,
  };
}

/** Carried through the OAuth round trip in the `state` parameter. `tier` indexes SCOPE_TIERS. */
export type SignInState = { input: string; tier: number };

export const LAST_TIER = SCOPE_TIERS.length - 1;

export function parseSignInState(state: string | null | undefined): SignInState | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(state);
    if (typeof parsed?.input !== "string") return null;
    if (Number.isInteger(parsed.tier) && parsed.tier >= 0 && parsed.tier <= LAST_TIER) {
      return { input: parsed.input, tier: parsed.tier };
    }
    // Sign-ins started before the permission set: granular, then fallback.
    if (typeof parsed.fallback === "boolean") return { input: parsed.input, tier: parsed.fallback ? 2 : 1 };
    return null;
  } catch {
    return null;
  }
}

/**
 * Starts sign-in for a handle, DID or PDS URL and returns the URL to send
 * the browser to. Asks for the best scopes first and moves down
 * SCOPE_TIERS while the authorization server rejects them.
 */
export async function startSignIn(
  input: string,
  tier = 0,
  opts: { selectAccount?: boolean } = {},
): Promise<URL> {
  const client = await getOAuthClient();
  const state: SignInState = { input, tier };
  try {
    return await client.authorize(input, {
      scope: SCOPE_TIERS[tier],
      state: JSON.stringify(state),
      // Adding an account: let them pick or enter another one, not reuse the last.
      ...(opts.selectAccount ? { prompt: "select_account" as const } : {}),
    });
  } catch (err) {
    if (tier < LAST_TIER && oauthErrorCode(err) === "invalid_scope") {
      return startSignIn(input, tier + 1, opts);
    }
    throw err;
  }
}
