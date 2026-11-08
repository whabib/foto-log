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

/** How long a caption can be so that caption + newline + link fits in one post. */
export function maxCaptionGraphemes(photoUrl: string): number {
  return Math.min(300, MAX_POST_GRAPHEMES - graphemeLength(photoLinkText(photoUrl)) - 1);
}

/**
 * Text and facets for the Bluesky post that shares a photo: the caption,
 * then a new line with a link back to the photo on foto-log.com. Links and
 * hashtags in the caption become facets too; @mentions are left as plain
 * text, since resolving them needs extra permissions.
 */
export function buildPostText(
  caption: string,
  photoUrl: string,
): { text: string; facets: AppBskyRichtextFacet.Main[] } {
  const trimmed = caption.trim();
  const linkText = photoLinkText(photoUrl);
  const prefix = trimmed ? `${trimmed}\n` : "";
  const rt = new RichText({ text: prefix + linkText });
  rt.detectFacetsWithoutResolution();
  const encoder = new TextEncoder();
  const linkStart = encoder.encode(prefix).length;
  const facets = (rt.facets ?? []).filter(
    (f) =>
      f.index.byteEnd <= linkStart &&
      f.features.every((feat) => feat.$type !== "app.bsky.richtext.facet#mention"),
  );
  facets.push({
    index: { byteStart: linkStart, byteEnd: linkStart + encoder.encode(linkText).length },
    features: [{ $type: "app.bsky.richtext.facet#link", uri: photoUrl }],
  });
  return { text: prefix + linkText, facets };
}
