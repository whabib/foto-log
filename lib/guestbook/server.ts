import "server-only";
import { RichText } from "@atproto/api";
import type { CurrentUser } from "@/lib/auth";
import { agentFor, PhotoError } from "@/lib/photos/server";
import { graphemeLength } from "@/lib/photos/text";
import { TtlCache } from "@/lib/ttl-cache";
import {
  DEFAULT_GUESTBOOK_CAP,
  type Guestbook,
  type GuestbookEntry,
  MAX_ENTRY_GRAPHEMES,
  parseGuestbook,
} from "./entries";

const APPVIEW = "https://public.api.bsky.app";
const POST_COLLECTION = "app.bsky.feed.post";
const THREADGATE_COLLECTION = "app.bsky.feed.threadgate";

// Guestbooks are read on every photo page view; cache them briefly.
const cache = new TtlCache<string, Guestbook>(30_000, 2000);

/** Reads a photo's guestbook from Bluesky's public AppView. Empty if it can't be read. */
export async function getGuestbook(postUri: string, opts: { fresh?: boolean } = {}): Promise<Guestbook> {
  if (!opts.fresh) {
    const hit = cache.get(postUri);
    if (hit) return hit.value;
  }
  const url = new URL("/xrpc/app.bsky.feed.getPostThread", APPVIEW);
  url.searchParams.set("uri", postUri);
  url.searchParams.set("depth", "1");
  url.searchParams.set("parentHeight", "0");
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) {
      if (res.status !== 400) console.warn("Couldn't read guestbook", { postUri, status: res.status });
      return { entries: [], count: 0, closed: false };
    }
    const guestbook = parseGuestbook(await res.json(), DEFAULT_GUESTBOOK_CAP);
    cache.set(postUri, guestbook);
    return guestbook;
  } catch (err) {
    console.warn("Couldn't read guestbook", { postUri, err });
    return { entries: [], count: 0, closed: false };
  }
}

/** Splits an AT URI for a post into its repo DID and record key. */
function parsePostUri(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return m ? { did: m[1], rkey: m[2] } : null;
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
 * Bluesky post from their own account. When that fills the guestbook, the
 * owner's threadgate closes it to further replies from any client.
 */
export async function signGuestbook(
  user: CurrentUser,
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
  if (!target) throw new GuestbookError("invalid", "That photo can't be found.");

  const before = await getGuestbook(post.uri, { fresh: true });
  if (before.closed || before.count >= DEFAULT_GUESTBOOK_CAP) {
    throw new GuestbookError("closed", "This guestbook is full.");
  }

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
  // this instance.
  const entry: GuestbookEntry = {
    uri: data.uri,
    cid: data.cid,
    author: { did: user.did, handle: user.handle ?? user.did, displayName: null, avatar: null },
    text: rt.text,
    facets: facets.length ? facets : undefined,
    createdAt,
  };
  const count = before.count + 1;
  cache.set(post.uri, {
    entries: [...before.entries, entry].slice(0, DEFAULT_GUESTBOOK_CAP),
    count,
    closed: before.closed,
  });

  if (count >= DEFAULT_GUESTBOOK_CAP) {
    await closeGuestbook(target).catch((err) =>
      console.error("Couldn't close full guestbook", { postUri: post.uri, err }),
    );
  }
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
  } catch {
    // No threadgate yet.
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
  const cached = cache.get(postUri);
  if (cached) cache.set(postUri, { ...cached.value, closed: true });
}
