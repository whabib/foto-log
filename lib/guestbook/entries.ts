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
};

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
export function parseGuestbook(body: unknown, cap = DEFAULT_GUESTBOOK_CAP): Guestbook {
  const thread = isObj(body) && isObj(body.thread) ? body.thread : null;
  if (!thread || thread.$type !== "app.bsky.feed.defs#threadViewPost") {
    return { entries: [], count: 0, closed: false };
  }
  const gate = isObj(thread.threadgate) && isObj(thread.threadgate.record) ? thread.threadgate.record : null;
  const hidden = new Set(Array.isArray(gate?.hiddenReplies) ? gate.hiddenReplies.filter((u) => typeof u === "string") : []);
  const closed = Array.isArray(gate?.allow) && gate.allow.length === 0;

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
  entries.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.uri.localeCompare(b.uri));
  // Replies past the cap may slip in before the threadgate lands; they stay
  // on Bluesky but aren't shown here.
  return { entries: entries.slice(0, cap), count: entries.length, closed: closed || entries.length >= cap };
}
