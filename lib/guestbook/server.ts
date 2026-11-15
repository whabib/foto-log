import "server-only";
import { RichText } from "@atproto/api";
import type { CurrentUser } from "@/lib/auth";
import { agentFor, PhotoError } from "@/lib/photos/server";
import { graphemeLength } from "@/lib/photos/text";
import { TtlCache } from "@/lib/ttl-cache";
import {
  allowRules,
  applyGate,
  buildGuestbook,
  DEFAULT_GUESTBOOK_CAP,
  EMPTY_GUESTBOOK,
  type Guestbook,
  type GuestbookEntry,
  MAX_ENTRY_GRAPHEMES,
  parsePostUri,
  parseThreadReplies,
  type ThreadReplies,
  type WhoCanSignChoice,
} from "./entries";

const APPVIEW = "https://public.api.bsky.app";
const POST_COLLECTION = "app.bsky.feed.post";
const THREADGATE_COLLECTION = "app.bsky.feed.threadgate";

// Guestbooks are read on every photo page view; cache the AppView's answer briefly.
const threads = new TtlCache<string, ThreadReplies>(30_000, 2000);
// Entries signed from this site, kept until the AppView has surely indexed them.
const pending = new TtlCache<string, GuestbookEntry[]>(10 * 60_000, 2000);
// Threadgates written here, until the AppView has surely indexed them.
const gates = new TtlCache<string, GateRecord>(2 * 60_000, 2000);
// Posts we recently tried to close, so reads don't retry on every view.
const closeAttempts = new TtlCache<string, true>(10 * 60_000, 2000);

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
  opts: { fresh?: boolean; strict?: boolean } = {},
): Promise<Guestbook> {
  const target = parsePostUri(postUri);
  // A photo record could point at anyone's post; only the owner's own count.
  if (!target || target.did !== ownerDid) return EMPTY_GUESTBOOK;
  let thread = opts.fresh ? undefined : threads.get(postUri)?.value;
  if (!thread) {
    const fetched = await fetchThread(postUri);
    if (!fetched) {
      // Signing must know the reply rules; showing the page can do without.
      if (opts.strict) throw new GuestbookError("unavailable", "We couldn't check this guestbook. Please try again.");
      return EMPTY_GUESTBOOK;
    }
    thread = fetched;
    threads.set(postUri, thread);
  }
  const gate = gates.get(postUri)?.value;
  if (gate) thread = applyGate(thread, gate);
  const guestbook = buildGuestbook(thread, pending.get(postUri)?.value);
  if (guestbook.count >= DEFAULT_GUESTBOOK_CAP && !guestbook.gated && !closeAttempts.get(postUri)) {
    void tryClose(target);
  }
  return guestbook;
}

export class GuestbookError extends Error {
  constructor(
    readonly code: "invalid" | "closed" | "not_allowed" | "forbidden" | "unavailable" | "session_expired",
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

  const before = await getGuestbook(ownerDid, post.uri, { fresh: true, strict: true });
  if (before.count >= DEFAULT_GUESTBOOK_CAP) throw new GuestbookError("closed", "This guestbook is full.");
  // The owner can always sign their own guestbook below the cap.
  if (user.did !== ownerDid) {
    if (before.gated) throw new GuestbookError("closed", "This guestbook is closed.");
    if (!(await mayReply(before, ownerDid, user.did))) {
      throw new GuestbookError("not_allowed", notAllowedMessage(before));
    }
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

type GateRecord = { allow?: unknown; hiddenReplies?: string[] };

/**
 * Rewrites the threadgate on the owner's post with `change`, keeping the
 * rest of what's there. Uses the owner's stored OAuth session, so a full
 * guestbook can be closed when someone else signs the last entry.
 */
async function updateGate(
  target: { did: string; rkey: string },
  change: (gate: GateRecord) => GateRecord,
): Promise<void> {
  const agent = await agentFor(target.did);
  const postUri = `at://${target.did}/${POST_COLLECTION}/${target.rkey}`;
  // Another change (a second Hide, an automatic close) may land between our
  // read and write; swapRecord makes that write fail, and we start over.
  for (let attempt = 1; ; attempt++) {
    let current: GateRecord = {};
    let cid: string | null = null;
    try {
      const { data } = await agent.com.atproto.repo.getRecord({
        repo: target.did,
        collection: THREADGATE_COLLECTION,
        rkey: target.rkey,
      });
      const value = data.value as { allow?: unknown; hiddenReplies?: unknown };
      cid = data.cid ?? null;
      current = {
        allow: value.allow,
        hiddenReplies: Array.isArray(value.hiddenReplies)
          ? value.hiddenReplies.filter((u): u is string => typeof u === "string")
          : undefined,
      };
    } catch (err) {
      // Only a missing gate is safe to write over; anything else could lose
      // the owner's hidden replies or reply rules.
      if (errorName(err) !== "RecordNotFound") throw err;
    }
    const next = change(current);
    try {
      await agent.com.atproto.repo.putRecord({
        repo: target.did,
        collection: THREADGATE_COLLECTION,
        rkey: target.rkey,
        // null: the gate must still not exist.
        swapRecord: cid,
        record: {
          $type: THREADGATE_COLLECTION,
          post: postUri,
          ...(next.allow !== undefined ? { allow: next.allow } : {}),
          ...(next.hiddenReplies?.length ? { hiddenReplies: next.hiddenReplies } : {}),
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      if (errorName(err) === "InvalidSwap" && attempt < 3) continue;
      throw err;
    }
    // Show the change on the next view rather than waiting for the AppView.
    gates.set(postUri, next);
    return;
  }
}

/** Writes a threadgate on the owner's post that allows no more replies. */
async function closeGuestbook(target: { did: string; rkey: string }): Promise<void> {
  await updateGate(target, (gate) => ({ ...gate, allow: [] }));
}

/** Bluesky's limit on a threadgate's hidden replies. */
const MAX_HIDDEN_REPLIES = 300;

function ownersPost(user: CurrentUser, ownerDid: string, postUri: string) {
  const target = parsePostUri(postUri);
  if (!target || target.did !== ownerDid || user.did !== ownerDid) {
    throw new GuestbookError("forbidden", "Only the owner of this photo can do that.");
  }
  return target;
}

async function asOwner(run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (err) {
    if (err instanceof PhotoError) throw new GuestbookError("session_expired", err.message);
    throw err;
  }
}

/**
 * Hides an entry from the owner's guestbook by adding it to the photo
 * post's threadgate, which Bluesky apps honor too. Only the owner can.
 */
export async function hideEntry(user: CurrentUser, ownerDid: string, postUri: string, entryUri: string) {
  const target = ownersPost(user, ownerDid, postUri);
  if (!/^at:\/\/did:[^/]+\/app\.bsky\.feed\.post\/[^/]+$/.test(entryUri)) {
    throw new GuestbookError("invalid", "That entry can't be found.");
  }
  await asOwner(() =>
    updateGate(target, (gate) => {
      const hidden = gate.hiddenReplies ?? [];
      if (hidden.includes(entryUri)) return gate;
      if (hidden.length >= MAX_HIDDEN_REPLIES) {
        throw new GuestbookError("invalid", `You can hide up to ${MAX_HIDDEN_REPLIES} entries on a photo.`);
      }
      return { ...gate, hiddenReplies: [...hidden, entryUri] };
    }),
  );
  const left = pending.get(postUri)?.value.filter((e) => e.uri !== entryUri);
  if (left) pending.set(postUri, left);
}

/** Sets who can sign the guestbook of the owner's photo post. Only the owner can. */
export async function setWhoCanSign(user: CurrentUser, ownerDid: string, postUri: string, who: WhoCanSignChoice) {
  const target = ownersPost(user, ownerDid, postUri);
  await asOwner(() => updateGate(target, (gate) => ({ ...gate, allow: allowRules(who) })));
}

const followCache = new TtlCache<string, boolean>(60_000, 5000);

/** Whether `ownerDid` follows `did`, from Bluesky's public AppView. False if unknown. */
async function follows(ownerDid: string, did: string): Promise<boolean> {
  const key = `${ownerDid} ${did}`;
  const cached = followCache.get(key);
  if (cached) return cached.value;
  const url = new URL("/xrpc/app.bsky.graph.getRelationships", APPVIEW);
  url.searchParams.set("actor", ownerDid);
  url.searchParams.append("others", did);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!res.ok) return false;
    const body = (await res.json()) as { relationships?: { did?: string; following?: unknown }[] };
    const rel = body.relationships?.find((r) => r.did === did);
    const result = typeof rel?.following === "string";
    followCache.set(key, result);
    return result;
  } catch {
    return false;
  }
}

/**
 * Whether `did` may sign this guestbook under its reply rules. The owner
 * always may. Rules set elsewhere ("custom") are left to Bluesky apps.
 */
export async function mayReply(guestbook: Guestbook, ownerDid: string, did: string): Promise<boolean> {
  if (did === ownerDid) return true;
  switch (guestbook.who) {
    case "everyone":
      return true;
    case "following":
      return follows(ownerDid, did);
    default:
      return false;
  }
}

export function notAllowedMessage(guestbook: Guestbook): string {
  return guestbook.who === "following"
    ? "Only people this member follows can sign this guestbook."
    : "This guestbook only takes entries from some people. You can try replying on Bluesky.";
}
