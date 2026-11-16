/**
 * Fotolog names: a member's own one-word name on foto-log, e.g. "warren",
 * shown in place of their Bluesky handle and used in their URLs (/@warren).
 * Bluesky handles always contain a dot and names never do, so the two can't
 * be confused, and a name can't look like a domain someone else owns.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 32;

const NAME_RE = new RegExp(`^[a-z0-9][a-z0-9_]{${NAME_MIN - 1},${NAME_MAX - 1}}$`);

/** Names that would clash with foto-log's own pages, or that sound official. */
const RESERVED = new Set([
  "about",
  "account",
  "admin",
  "administrator",
  "api",
  "app",
  "blog",
  "bluesky",
  "bsky",
  "contact",
  "did",
  "faq",
  "foto_log",
  "fotolog",
  "fotologs",
  "friends",
  "groups",
  "health",
  "help",
  "home",
  "login",
  "member",
  "members",
  "logout",
  "mod",
  "moderator",
  "news",
  "oauth",
  "official",
  "post",
  "privacy",
  "profile",
  "root",
  "security",
  "settings",
  "signin",
  "signout",
  "signup",
  "staff",
  "support",
  "system",
  "team",
  "terms",
  "www",
]);

/** The name as stored and shown: trimmed, without a leading @, lowercase. */
export function normalizeName(input: string): string {
  return input.trim().replace(/^@/, "").toLowerCase();
}

/** Whether `value` (already normalized) has the shape of a Fotolog name. */
export function looksLikeName(value: string): boolean {
  return NAME_RE.test(value);
}

/** Why `name` (already normalized) can't be used, or null if it can. Doesn't check whether it's taken. */
export function nameProblem(name: string): string | null {
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return `Use ${NAME_MIN} to ${NAME_MAX} characters.`;
  }
  if (name.startsWith("_")) return "It can't start with an underscore.";
  if (!looksLikeName(name)) return "Use only letters, numbers and underscores.";
  if (RESERVED.has(name) || RESERVED.has(name.replace(/_/g, ""))) return "That name is reserved.";
  return null;
}
