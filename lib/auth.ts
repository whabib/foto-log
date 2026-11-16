import "server-only";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { and, count, desc, eq, gt, isNull, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { isProduction } from "@/lib/config";
import { randomId, sign, unsign } from "@/lib/crypto";
import { getDb, withLock } from "@/lib/db";
import { oauthSession, userSession } from "@/lib/db/schema";
import { getOAuthClient } from "@/lib/oauth/client";
import { fetchFromPds } from "@/lib/safe-fetch";

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
    const res = await fetchFromPds(url);
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

/** The most accounts one browser can be signed in to at once. */
export const MAX_ACCOUNTS = 5;

// Identifies this browser, so the accounts signed in on it can be listed and switched between.
const BROWSER_COOKIE = isProduction ? "__Host-fotolog_browser" : "fotolog_browser";
/**
 * The current account's DID, readable by scripts: open tabs compare it with
 * the account they were shown for, to notice a switch made in another tab.
 * A DID is public, so this reveals nothing.
 */
export const ACCOUNT_COOKIE = "fotolog_account";

// Browsers cap cookie lifetimes at 400 days.
const browserCookieOptions = { ...sessionCookieOptions, maxAge: 400 * 24 * 60 * 60 };
const accountCookieOptions = { ...sessionCookieOptions, httpOnly: false };

const live = () => gt(userSession.expiresAt, new Date());

async function readBrowserId(): Promise<string | null> {
  const raw = (await cookies()).get(BROWSER_COOKIE)?.value;
  return raw ? unsign(raw) : null;
}

/** This browser's id, creating it (and its cookie) if it has none. Only in Route Handlers and Server Functions. */
async function ensureBrowserId(): Promise<string> {
  const existing = await readBrowserId();
  const id = existing ?? randomId();
  // Refreshed on every sign-in or switch, so an active browser keeps its id.
  (await cookies()).set(BROWSER_COOKIE, sign(id), browserCookieOptions);
  return id;
}

/** Makes session `id` (for `did`) this browser's current one. */
async function setCurrent(id: string, did: string): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, sign(id), sessionCookieOptions);
  jar.set(ACCOUNT_COOKIE, did, accountCookieOptions);
  const db = await getDb();
  await db.update(userSession).set({ lastActiveAt: new Date() }).where(eq(userSession.id, id));
}

function clearCurrent(jar: Awaited<ReturnType<typeof cookies>>) {
  jar.delete(SESSION_COOKIE);
  jar.delete(ACCOUNT_COOKIE);
}

export type SignInResult = { ok: true } | { ok: false; reason: "gone" | "full" };

/**
 * Signs `did` in on this browser and makes it the current account. If this
 * browser is already signed in to it, switches to that session instead of
 * adding another. Fails if the account's OAuth session is gone (for
 * example, revoked by a sign-out that ran between token exchange and this
 * call), or if the browser already holds MAX_ACCOUNTS other accounts.
 * Only in Route Handlers and Server Functions.
 */
export async function signInOnBrowser(did: string, handle: string | null): Promise<SignInResult> {
  const browserId = await ensureBrowserId();
  const db = await getDb();
  // Sessions from before multiple accounts have no browser; claim the current one.
  const currentId = await currentSessionId();
  if (currentId) {
    await db
      .update(userSession)
      .set({ browserId })
      .where(and(eq(userSession.id, currentId), isNull(userSession.browserId)));
  }
  const result = await withLock(accountLock(did), async (): Promise<SignInResult | { ok: true; id: string }> => {
    const [tokens] = await db.select({ sub: oauthSession.sub }).from(oauthSession).where(eq(oauthSession.sub, did));
    if (!tokens) return { ok: false, reason: "gone" };
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    const [existing] = await db
      .select({ id: userSession.id })
      .from(userSession)
      .where(and(eq(userSession.browserId, browserId), eq(userSession.did, did), live()))
      .limit(1);
    if (existing) {
      await db.update(userSession).set({ handle, expiresAt }).where(eq(userSession.id, existing.id));
      return { ok: true, id: existing.id };
    }
    const [{ n }] = await db
      .select({ n: count() })
      .from(userSession)
      .where(and(eq(userSession.browserId, browserId), live()));
    if (n >= MAX_ACCOUNTS) return { ok: false, reason: "full" };
    const id = randomId();
    await db.insert(userSession).values({ id, did, handle, browserId, expiresAt });
    return { ok: true, id };
  });
  if (!result.ok) {
    if (result.reason === "full") await revokeIfUnused(did);
    return result;
  }
  await setCurrent((result as { id: string }).id, did);
  return { ok: true };
}

/** Whether this browser can sign in to another account. */
export async function hasRoomForAccount(): Promise<boolean> {
  return (await browserAccounts()).length < MAX_ACCOUNTS;
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
    .where(and(eq(userSession.id, id), live()));
  return row ?? null;
}

export type BrowserAccount = { sessionId: string; did: string; handle: string | null; current: boolean };

/**
 * The accounts signed in on this browser, the current one first, then the
 * most recently used. Includes the current session even if it predates
 * browser ids.
 */
export async function browserAccounts(): Promise<BrowserAccount[]> {
  const [browserId, currentId] = await Promise.all([readBrowserId(), currentSessionId()]);
  const ids = [browserId ? eq(userSession.browserId, browserId) : null, currentId ? eq(userSession.id, currentId) : null].filter(
    (c) => c !== null,
  );
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db
    .select({ sessionId: userSession.id, did: userSession.did, handle: userSession.handle })
    .from(userSession)
    .where(and(or(...ids), live()))
    .orderBy(desc(userSession.lastActiveAt));
  return rows
    .map((r) => ({ ...r, current: r.sessionId === currentId }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/**
 * Switches this browser to another of its accounts. Returns the account
 * switched to, or null if `did` isn't signed in on this browser.
 */
export async function switchAccount(did: string): Promise<BrowserAccount | null> {
  const target = (await browserAccounts()).find((a) => a.did === did);
  if (!target) return null;
  await setCurrent(target.sessionId, target.did);
  return target;
}

/**
 * Signs `did` out of this browser (the current account if `did` is
 * omitted). If that was the current account, switches to the most
 * recently used of the others, if any, and returns it. If it was the
 * account's last session anywhere, also revokes its OAuth tokens.
 */
export async function signOutOfBrowser(did?: string, opts: { switchToNext?: boolean } = {}): Promise<BrowserAccount | null> {
  const accounts = await browserAccounts();
  const target = did ? accounts.find((a) => a.did === did) : accounts.find((a) => a.current);
  const jar = await cookies();
  if (!target) {
    if (!did) clearCurrent(jar);
    return null;
  }
  await endSession(target.sessionId, target.did);
  if (!target.current) return null;
  clearCurrent(jar);
  const next = opts.switchToNext === false ? undefined : accounts.find((a) => !a.current);
  if (!next) return null;
  await setCurrent(next.sessionId, next.did);
  return next;
}

/** Deletes one session, revoking the account's tokens if it was their last. */
async function endSession(id: string, did: string): Promise<void> {
  const db = await getDb();
  await withLock(accountLock(did), async () => {
    await db.delete(userSession).where(eq(userSession.id, id));
    await revokeIfUnusedLocked(did);
  });
}

async function revokeIfUnused(did: string): Promise<void> {
  await withLock(accountLock(did), () => revokeIfUnusedLocked(did));
}

async function revokeIfUnusedLocked(did: string): Promise<void> {
  const db = await getDb();
  const others = await db
    .select({ id: userSession.id })
    .from(userSession)
    .where(and(eq(userSession.did, did), live()))
    .limit(1);
  if (others.length > 0) return;
  const client = await getOAuthClient();
  await client.revoke(did).catch((err) => {
    console.warn("OAuth revoke failed", { did, err });
  });
}
