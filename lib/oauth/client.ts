import "server-only";
import {
  buildAtprotoLoopbackClientMetadata,
  JoseKey,
  NodeOAuthClient,
  type OAuthClientMetadataInput,
} from "@atproto/oauth-client-node";
import { baseUrl, isProduction, secret } from "@/lib/config";
import { CLIENT_SCOPE, FALLBACK_SCOPE, GRANULAR_SCOPE } from "./scopes";
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

/** Carried through the OAuth round trip in the `state` parameter. */
export type SignInState = { input: string; fallback: boolean };

export function parseSignInState(state: string | null | undefined): SignInState | null {
  if (!state) return null;
  try {
    const parsed = JSON.parse(state);
    return typeof parsed?.input === "string" && typeof parsed?.fallback === "boolean"
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Starts sign-in for a handle, DID or PDS URL and returns the URL to send
 * the browser to. Asks for granular scopes first and falls back to
 * `transition:generic` if the authorization server rejects them.
 */
export async function startSignIn(input: string, fallback = false): Promise<URL> {
  const client = await getOAuthClient();
  const state: SignInState = { input, fallback };
  try {
    return await client.authorize(input, {
      scope: fallback ? FALLBACK_SCOPE : GRANULAR_SCOPE,
      state: JSON.stringify(state),
    });
  } catch (err) {
    if (!fallback && oauthErrorCode(err) === "invalid_scope") {
      return startSignIn(input, true);
    }
    throw err;
  }
}
