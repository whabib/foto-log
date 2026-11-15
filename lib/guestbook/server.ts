import "server-only";
import { RichText } from "@atproto/api";
import type { CurrentUser } from "@/lib/auth";
import { agentFor, PhotoError } from "@/lib/photos/server";
import { graphemeLength } from "@/lib/photos/text";
import { TtlCache } from "@/lib/ttl-cache";
import {
  buildGuestbook,
  DEFAULT_GUESTBOOK_CAP,
  type Guestbook,
  type GuestbookEntry,
  MAX_ENTRY_GRAPHEMES,
  parseThreadReplies,
  type ThreadReplies,
} from "./entries";

const APPVIEW = "https://public.api.bsky.app";
const POST_COLLECTION = "app.bsky.feed.post";
const THREADGATE_COLLECTION = "app.bsky.feed.threadgate";

// Guestbooks are read on every photo page view; cache the AppView's answer briefly.
const threads = new TtlCache<string, ThreadReplies>(30_000, 2000);
// Entries signed from this site, kept until the AppView has surely indexed them.
const pending = new TtlCache<string, GuestbookEntry[]>(10 * 60_000, 2000);
// Posts we recently tried to close, so reads don't retry on every view.
const closeAttempts = new TtlCache<string, true>(10 * 60_000, 2000);

/** Splits an AT URI for a post into its repo DID and record key. */
export function parsePostUri(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return m ? { did: m[1], rkey: m[2] } : null;
}

async function fetchThread(postUri: string): Promise<ThreadReplies | null> {
  const url = new URL("/xrpc/app.bsky.feed.getPostThread", APPVIEW);
  url.searchParams.set("uri", postUri);
  url.searchParams.set("depth", "1");
  url.searchParams.set("parentHeight", "0");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 400) console.warn("Couldn't read guestbook", { postUri, status: res.status });
      return null;
    }
    return parseThreadReplies(await res.json());
  } catch (err) {
    console.warn("Couldn't read guestbook", { postUri, err });
    return null;
  }
}

/**
 * Reads the guestbook of `ownerDid`'s photo post from Bluesky's public
 * AppView, plus entries signed here that it hasn't indexed yet. Empty if
 * the post isn't in the owner's repository or can't be read. If the
 * guestbook is full but its post isn't gated yet (the last reply came from
 * a Bluesky app, or an earlier close failed), closes it in the background.
 */
export async function getGuestbook(
  ownerDid: string,
  postUri: string,
  opts: { fresh?: boolean } = {},
): Promise<Guestbook> {
  const target = parsePostUri(postUri);
  // A photo record could point at anyone's post; only the owner's own count.
  if (!target || target.did !== ownerDid) return { entries: [], count: 0, closed: false, gated: false };
  let thread = opts.fresh ? undefined : threads.get(postUri)?.value;
  if (!thread) {
    const fetched = await fetchThread(postUri);
    if (!fetched) return { entries: [], count: 0, closed: false, gated: false };
    thread = fetched;
    threads.set(postUri, thread);
  }
  const guestbook = buildGuestbook(thread, pending.get(postUri)?.value);
  if (guestbook.count >= DEFAULT_GUESTBOOK_CAP && !guestbook.gated && !closeAttempts.get(postUri)) {
    void tryClose(target);
  }
  return guestbook;
}

export class GuestbookError extends Error {
  constructor(
    readonly code: "invalid" | "closed" | "session_expired",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Signs a photo's guestbook as `user`: posts a reply to the photo's
 * Bluesky post from their own account. `ownerDid` is the photo's owner; the
 * post must be in their repository. When this fills the guestbook, the
 * owner's threadgate closes it to further replies from any client.
 */
export async function signGuestbook(
  user: CurrentUser,
  ownerDid: string,
  post: { uri: string; cid: string },
  text: string,
): Promise<void> {
  const body = text.trim();
  if (!body) throw new GuestbookError("invalid", "Write something first.");
  if (graphemeLength(body) > MAX_ENTRY_GRAPHEMES) {
    throw new GuestbookError("invalid", `Entries can be up to ${MAX_ENTRY_GRAPHEMES} characters.`);
  }
  if (new TextEncoder().encode(body).length > 3000) {
    throw new GuestbookError("invalid", "That's too long. Try fewer emoji.");
  }
  const target = parsePostUri(post.uri);
  // Only ever reply to, and gate, a post in the photo owner's own repository.
  if (!target || target.did !== ownerDid) throw new GuestbookError("invalid", "That photo can't be found.");

  const before = await getGuestbook(ownerDid, post.uri, { fresh: true });
  if (before.closed) throw new GuestbookError("closed", "This guestbook is full.");

  let agent;
  try {
    agent = await agentFor(user.did);
  } catch (err) {
    if (err instanceof PhotoError) throw new GuestbookError("session_expired", err.message);
    throw err;
  }
  // Links and hashtags become facets; @mentions stay plain text, since
  // resolving them needs extra permissions.
  const rt = new RichText({ text: body });
  rt.detectFacetsWithoutResolution();
  const facets = (rt.facets ?? []).filter((f) =>
    f.features.every((feat) => feat.$type !== "app.bsky.richtext.facet#mention"),
  );
  const createdAt = new Date().toISOString();
  const ref = { uri: post.uri, cid: post.cid };
  const { data } = await agent.com.atproto.repo.createRecord({
    repo: user.did,
    collection: POST_COLLECTION,
    record: {
      $type: POST_COLLECTION,
      text: rt.text,
      ...(facets.length ? { facets } : {}),
      reply: { root: ref, parent: ref },
      createdAt,
    },
  });

  // The AppView takes a moment to index the reply; show it right away on
  // this instance and count it toward the cap until it's indexed.
  const entry: GuestbookEntry = {
    uri: data.uri,
    cid: data.cid,
    author: { did: user.did, handle: user.handle ?? user.did, displayName: null, avatar: null },
    text: rt.text,
    facets: facets.length ? facets : undefined,
    createdAt,
  };
  pending.set(post.uri, [...(pending.get(post.uri)?.value ?? []), entry]);

  if (before.count + 1 >= DEFAULT_GUESTBOOK_CAP) await tryClose(target);
}

/** Closes a full guestbook, logging rather than throwing. Retried on later reads after a while. */
async function tryClose(target: { did: string; rkey: string }): Promise<void> {
  const postUri = `at://${target.did}/${POST_COLLECTION}/${target.rkey}`;
  closeAttempts.set(postUri, true);
  try {
    await closeGuestbook(target);
  } catch (err) {
    console.error("Couldn't close full guestbook", { postUri, err });
  }
}

function errorName(err: unknown): string | undefined {
  const e = err as { error?: unknown } | null;
  return typeof e?.error === "string" ? e.error : undefined;
}

/**
 * Writes a threadgate on the owner's post that allows no more replies,
 * keeping any replies the owner already hid. Uses the owner's stored
 * OAuth session, so it works when someone else signs the last entry.
 */
async function closeGuestbook(target: { did: string; rkey: string }): Promise<void> {
  const agent = await agentFor(target.did);
  let hiddenReplies: string[] | undefined;
  try {
    const { data } = await agent.com.atproto.repo.getRecord({
      repo: target.did,
      collection: THREADGATE_COLLECTION,
      rkey: target.rkey,
    });
    const hidden = (data.value as { hiddenReplies?: unknown }).hiddenReplies;
    if (Array.isArray(hidden)) hiddenReplies = hidden.filter((u): u is string => typeof u === "string");
  } catch (err) {
    // Only a missing gate is safe to write over; anything else could lose
    // the owner's hidden replies.
    if (errorName(err) !== "RecordNotFound") throw err;
  }
  const postUri = `at://${target.did}/${POST_COLLECTION}/${target.rkey}`;
  await agent.com.atproto.repo.putRecord({
    repo: target.did,
    collection: THREADGATE_COLLECTION,
    rkey: target.rkey,
    record: {
      $type: THREADGATE_COLLECTION,
      post: postUri,
      allow: [],
      ...(hiddenReplies?.length ? { hiddenReplies } : {}),
      createdAt: new Date().toISOString(),
    },
  });
  const cached = threads.get(postUri);
  if (cached) threads.set(postUri, { ...cached.value, gated: true });
}
