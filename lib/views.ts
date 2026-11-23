import { isValidDid, isValidRecordKey } from "@atproto/syntax";

/**
 * Photo view counting, the parts that need no server: the view token's
 * format, its timing, the hour bucket, and single use.
 *
 * A photo page renders a signed, single-use token naming the photo. The
 * browser sends it back once the page has been open a moment, and the
 * server counts one impression for the photo's hour.
 */

/** A token counts only after the page has been open this long. */
export const VIEW_MIN_DELAY_MS = 2_000;
/** And only within this long of the page being rendered. */
export const VIEW_TOKEN_TTL_MS = 10 * 60_000;

const TOKEN_VERSION = "v1";

/** What a view token names. */
export type ViewClaim = { did: string; rkey: string; issuedAt: number; nonce: string };

/** The unsigned payload of a view token; sign it before handing it to the page. */
export function viewPayload(claim: ViewClaim): string {
  return [TOKEN_VERSION, claim.did, claim.rkey, String(claim.issuedAt), claim.nonce].join("|");
}

/** Parses an unsigned payload made by {@link viewPayload}, or returns null. */
export function parseViewPayload(payload: string): ViewClaim | null {
  const parts = payload.split("|");
  if (parts.length !== 5) return null;
  const [version, did, rkey, issued, nonce] = parts;
  if (version !== TOKEN_VERSION || !isValidDid(did) || !isValidRecordKey(rkey) || !nonce) return null;
  if (!/^\d{1,15}$/.test(issued)) return null;
  return { did, rkey, issuedAt: Number(issued), nonce };
}

/** Why a token's timing rules it out, or null if it's in its window. */
export function tokenTiming(issuedAt: number, now: number): "early" | "expired" | null {
  const age = now - issuedAt;
  if (age < VIEW_MIN_DELAY_MS) return "early";
  if (age > VIEW_TOKEN_TTL_MS) return "expired";
  return null;
}

/** The start of the UTC hour `ms` falls in. */
export function hourBucket(ms: number): Date {
  return new Date(Math.floor(ms / 3_600_000) * 3_600_000);
}

/**
 * Remembers used tokens in memory, per server instance, so each counts
 * once. Nothing here is stored. With several instances each keeps its own
 * memory, so a replayed token can count at most once per instance. When
 * the memory is full of tokens that are still valid, new tokens are turned
 * away rather than forgetting a valid one, which would let it count again.
 */
export class UsedTokens {
  private used = new Map<string, number>();

  constructor(private readonly maxEntries = 50_000) {}

  /** Marks the token used; false if it already was, or if there's no room to remember it. */
  claim(claim: ViewClaim, now: number): boolean {
    if (this.used.has(claim.nonce)) return false;
    if (this.used.size >= this.maxEntries) {
      // Expired tokens can't count anyway, so they're safe to forget.
      for (const [k, expires] of this.used) if (expires < now) this.used.delete(k);
      if (this.used.size >= this.maxEntries) return false;
    }
    this.used.set(claim.nonce, claim.issuedAt + VIEW_TOKEN_TTL_MS);
    return true;
  }

  get size(): number {
    return this.used.size;
  }
}
