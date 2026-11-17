import { RichText, type AppBskyRichtextFacet } from "@atproto/api";

/** Bluesky's limit on post text. */
export const MAX_POST_GRAPHEMES = 300;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function graphemeLength(text: string): number {
  return Array.from(segmenter.segment(text)).length;
}

/** The link text shown in the Bluesky post, e.g. "foto-log.com/@alice.bsky.social/2026-10-14". */
export function photoLinkText(photoUrl: string): string {
  return photoUrl.replace(/^https?:\/\//, "");
}

/** Who a group's photo is by, for its Bluesky post: the uploader's DID and current handle. */
export type PostCredit = { did: string; handle: string };

/** Longest handle the credit shows in full; longer ones are cut short, still mentioning the uploader. */
export const CREDIT_HANDLE_MAX = 60;

/**
 * The credit line in a group's Bluesky post, e.g. "by @alice.bsky.social".
 * A handle over CREDIT_HANDLE_MAX graphemes is cut short with "…", so a long
 * one can't crowd out the link.
 */
export function creditText(handle: string): string {
  const parts = Array.from(segmenter.segment(handle), (s) => s.segment);
  const shown = parts.length > CREDIT_HANDLE_MAX ? `${parts.slice(0, CREDIT_HANDLE_MAX - 1).join("")}…` : handle;
  return `by @${shown}`;
}

/**
 * How long a caption can be so that caption + newline (+ credit + newline)
 * + link fits in one post.
 */
export function maxCaptionGraphemes(photoUrl: string, creditHandle?: string | null): number {
  const credit = creditHandle ? graphemeLength(creditText(creditHandle)) + 1 : 0;
  return Math.min(300, MAX_POST_GRAPHEMES - graphemeLength(photoLinkText(photoUrl)) - 1 - credit);
}

/**
 * Text and facets for the Bluesky post that shares a photo: the caption,
 * then a new line with a link back to the photo on foto-log.com. Links and
 * hashtags in the caption become facets too; @mentions are left as plain
 * text, since resolving them needs extra permissions. With `credit` (a
 * member's photo on a group), a line naming the uploader comes before the
 * link, as a mention of their DID.
 */
export function buildPostText(
  caption: string,
  photoUrl: string,
  credit?: PostCredit | null,
): { text: string; facets: AppBskyRichtextFacet.Main[] } {
  const trimmed = caption.trim();
  const linkText = photoLinkText(photoUrl);
  const captionPart = trimmed ? `${trimmed}\n` : "";
  const creditLine = credit ? creditText(credit.handle) : "";
  const prefix = captionPart + (credit ? `${creditLine}\n` : "");
  const rt = new RichText({ text: captionPart + linkText });
  rt.detectFacetsWithoutResolution();
  const encoder = new TextEncoder();
  const captionEnd = encoder.encode(captionPart).length;
  const linkStart = encoder.encode(prefix).length;
  const facets = (rt.facets ?? []).filter(
    (f) =>
      f.index.byteEnd <= captionEnd &&
      f.features.every((feat) => feat.$type !== "app.bsky.richtext.facet#mention"),
  );
  if (credit) {
    // "@handle", after "by ".
    const start = captionEnd + encoder.encode("by ").length;
    facets.push({
      index: { byteStart: start, byteEnd: captionEnd + encoder.encode(creditLine).length },
      features: [{ $type: "app.bsky.richtext.facet#mention", did: credit.did }],
    });
  }
  facets.push({
    index: { byteStart: linkStart, byteEnd: linkStart + encoder.encode(linkText).length },
    features: [{ $type: "app.bsky.richtext.facet#link", uri: photoUrl }],
  });
  return { text: prefix + linkText, facets };
}
