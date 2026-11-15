/** Default number of entries a photo's guestbook takes before it closes. */
export const DEFAULT_GUESTBOOK_CAP = 100;
/** Bluesky's limit on post text. */
export const MAX_ENTRY_GRAPHEMES = 300;

export type GuestbookEntry = {
  uri: string;
  cid: string;
  author: { did: string; handle: string; displayName: string | null; avatar: string | null };
  text: string;
  facets: unknown[] | undefined;
  createdAt: string;
};

export type Guestbook = {
  entries: GuestbookEntry[];
  /** Replies counted toward the cap, including ones not shown. */
  count: number;
  /** True once a threadgate allows nobody to reply, or the cap is reached. */
  closed: boolean;
  /** True when the post's threadgate allows nobody to reply. */
  gated: boolean;
};

/** What the AppView says about a thread, before the cap is applied. */
export type ThreadReplies = { entries: GuestbookEntry[]; gated: boolean };

/** Labels that mean a post shouldn't be shown at all. */
const HIDING_LABELS = new Set(["!hide", "!takedown", "!suspend"]);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null;
const str = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Turns an app.bsky.feed.getPostThread response into guestbook entries:
 * direct replies to the photo's post, oldest first, without replies the
 * owner hid, blocked or deleted ones, or posts labeled to be hidden.
 */
export function parseThreadReplies(body: unknown): ThreadReplies {
  const thread = isObj(body) && isObj(body.thread) ? body.thread : null;
  if (!thread || thread.$type !== "app.bsky.feed.defs#threadViewPost") {
    return { entries: [], gated: false };
  }
  // The threadgate view is part of the root post's view.
  const gateView = isObj(thread.post) && isObj(thread.post.threadgate) ? thread.post.threadgate : null;
  const gate = gateView && isObj(gateView.record) ? gateView.record : null;
  const hidden = new Set(Array.isArray(gate?.hiddenReplies) ? gate.hiddenReplies.filter((u) => typeof u === "string") : []);
  const gated = Array.isArray(gate?.allow) && gate.allow.length === 0;

  const replies = Array.isArray(thread.replies) ? thread.replies : [];
  const entries: GuestbookEntry[] = [];
  for (const reply of replies) {
    if (!isObj(reply) || reply.$type !== "app.bsky.feed.defs#threadViewPost" || !isObj(reply.post)) continue;
    const post = reply.post;
    const uri = str(post.uri);
    const cid = str(post.cid);
    if (!uri || !cid || hidden.has(uri)) continue;
    const labels = Array.isArray(post.labels) ? post.labels : [];
    if (labels.some((l) => isObj(l) && HIDING_LABELS.has(String(l.val)))) continue;
    const author = isObj(post.author) ? post.author : {};
    const record = isObj(post.record) ? post.record : {};
    const did = str(author.did);
    const handle = str(author.handle);
    if (!did || !handle) continue;
    entries.push({
      uri,
      cid,
      author: {
        did,
        handle,
        displayName: str(author.displayName) || null,
        avatar: str(author.avatar)?.startsWith("https://cdn.bsky.app/") ? str(author.avatar) : null,
      },
      text: str(record.text) ?? "",
      facets: Array.isArray(record.facets) ? record.facets : undefined,
      createdAt: str(record.createdAt) ?? str(post.indexedAt) ?? "",
    });
  }
  return { entries: sortEntries(entries), gated };
}

function sortEntries(entries: GuestbookEntry[]): GuestbookEntry[] {
  return entries.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.uri.localeCompare(b.uri));
}

/**
 * The guestbook to show: the AppView's replies plus any signed from this
 * site that it hasn't indexed yet, oldest first, up to `cap`.
 */
export function buildGuestbook(
  thread: ThreadReplies,
  pending: GuestbookEntry[] = [],
  cap = DEFAULT_GUESTBOOK_CAP,
): Guestbook {
  const seen = new Set(thread.entries.map((e) => e.uri));
  const entries = sortEntries([...thread.entries, ...pending.filter((e) => !seen.has(e.uri))]);
  // Replies past the cap may slip in before the threadgate lands; they stay
  // on Bluesky but aren't shown here.
  return {
    entries: entries.slice(0, cap),
    count: entries.length,
    closed: thread.gated || entries.length >= cap,
    gated: thread.gated,
  };
}

/** Parses a getPostThread response straight into a guestbook. */
export function parseGuestbook(body: unknown, cap = DEFAULT_GUESTBOOK_CAP): Guestbook {
  return buildGuestbook(parseThreadReplies(body), [], cap);
}

/** Splits an AT URI for a post into its repo DID and record key. */
export function parsePostUri(uri: string): { did: string; rkey: string } | null {
  const m = /^at:\/\/(did:[^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/.exec(uri);
  return m ? { did: m[1], rkey: m[2] } : null;
}
