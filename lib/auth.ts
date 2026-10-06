import "server-only";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { isProduction } from "@/lib/config";
import { randomId, sign, unsign } from "@/lib/crypto";
import { getDb, withLock } from "@/lib/db";
import { oauthSession, userSession } from "@/lib/db/schema";
import { getOAuthClient } from "@/lib/oauth/client";

// "__Host-" cookies must be Secure, so dev (plain http) uses a plain name.
export const SESSION_COOKIE = isProduction ? "__Host-fotolog_session" : "fotolog_session";
const SESSION_DAYS = 30;

export const sessionCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};

export type CurrentUser = { did: string; handle: string | null };

/**
 * Looks up the account's handle on its own PDS. Returns null if the PDS
 * says the handle doesn't currently verify.
 */
export async function lookupHandle(session: OAuthSession): Promise<string | null> {
  try {
    const { aud } = await session.getTokenInfo(false);
    const url = new URL("/xrpc/com.atproto.repo.describeRepo", aud);
    url.searchParams.set("repo", session.did);
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { handle?: string; handleIsCorrect?: boolean };
    return data.handleIsCorrect && data.handle ? data.handle : null;
  } catch {
    return null;
  }
}

/**
 * Browser-session changes for one account run under this lock, so a sign-out
 * in one browser can't revoke tokens that a sign-in elsewhere just stored.
 */
const accountLock = (did: string) => `account:${did}`;

/**
 * Creates a browser session for `did` and returns the signed cookie value.
 * Returns null if the account's OAuth session is gone (for example, revoked
 * by a sign-out that ran between token exchange and this call).
 */
export async function createUserSession(did: string, handle: string | null): Promise<string | null> {
  return withLock(accountLock(did), async () => {
    const db = await getDb();
    const [tokens] = await db
      .select({ sub: oauthSession.sub })
      .from(oauthSession)
      .where(eq(oauthSession.sub, did));
    if (!tokens) return null;
    const id = randomId();
    await db.insert(userSession).values({
      id,
      did,
      handle,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    });
    return sign(id);
  });
}

async function currentSessionId(): Promise<string | null> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  return raw ? unsign(raw) : null;
}

/** The signed-in user for this request, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const id = await currentSessionId();
  if (!id) return null;
  const db = await getDb();
  const [row] = await db
    .select({ did: userSession.did, handle: userSession.handle })
    .from(userSession)
    .where(and(eq(userSession.id, id), gt(userSession.expiresAt, new Date())));
  return row ?? null;
}

/**
 * Ends this browser's session. If it was the account's last browser
 * session, also revokes the OAuth tokens with the user's server.
 */
export async function endUserSession(): Promise<void> {
  const id = await currentSessionId();
  (await cookies()).delete(SESSION_COOKIE);
  if (!id) return;
  const db = await getDb();
  const [session] = await db
    .select({ did: userSession.did })
    .from(userSession)
    .where(eq(userSession.id, id));
  if (!session) return;
  const { did } = session;
  await withLock(accountLock(did), async () => {
    await db.delete(userSession).where(eq(userSession.id, id));
    const others = await db
      .select({ id: userSession.id })
      .from(userSession)
      .where(and(eq(userSession.did, did), gt(userSession.expiresAt, new Date())))
      .limit(1);
    if (others.length === 0) {
      const client = await getOAuthClient();
      await client.revoke(did).catch((err) => {
        console.warn("OAuth revoke failed", { did, err });
      });
    }
  });
}
