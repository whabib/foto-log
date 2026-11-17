import { describe, expect, it } from "vitest";
import { buildPostText, creditText, graphemeLength, maxCaptionGraphemes, photoLinkText } from "./text";

const url = "https://foto-log.com/@alice.bsky.social/2026-10-14";
const linkText = "foto-log.com/@alice.bsky.social/2026-10-14";
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("buildPostText", () => {
  it("puts the caption, a newline, then the link", () => {
    const { text, facets } = buildPostText("Sunset at the pier", url);
    expect(text).toBe(`Sunset at the pier\n${linkText}`);
    const link = facets.at(-1)!;
    expect(link.features).toEqual([{ $type: "app.bsky.richtext.facet#link", uri: url }]);
    expect(link.index.byteStart).toBe(bytes("Sunset at the pier\n"));
    expect(link.index.byteEnd).toBe(bytes(text));
  });

  it("is just the link when there's no caption", () => {
    const { text, facets } = buildPostText("   ", url);
    expect(text).toBe(linkText);
    expect(facets).toHaveLength(1);
    expect(facets[0].index).toEqual({ byteStart: 0, byteEnd: bytes(linkText) });
  });

  it("measures the link facet in UTF-8 bytes after emoji", () => {
    const { text, facets } = buildPostText("📷 café", url);
    expect(facets.at(-1)!.index.byteStart).toBe(bytes("📷 café\n"));
    expect(facets.at(-1)!.index.byteEnd).toBe(bytes(text));
  });

  it("keeps hashtags and links in the caption but not mentions", () => {
    const { facets } = buildPostText("#fotolog with @bob.bsky.social see https://example.com", url);
    const types = facets.map((f) => f.features[0].$type);
    expect(types).toContain("app.bsky.richtext.facet#tag");
    expect(types).not.toContain("app.bsky.richtext.facet#mention");
    expect(types.filter((t) => t === "app.bsky.richtext.facet#link")).toHaveLength(2);
  });
});

describe("credit on a group's post", () => {
  const credit = { did: "did:plc:alice", handle: "alice.bsky.social" };

  it("names the uploader between the caption and the link, as a mention", () => {
    const { text, facets } = buildPostText("Café 📷", url, credit);
    expect(text).toBe(`Café 📷\nby @alice.bsky.social\n${linkText}`);
    const mention = facets.find((f) => f.features[0].$type === "app.bsky.richtext.facet#mention")!;
    expect(mention.features).toEqual([{ $type: "app.bsky.richtext.facet#mention", did: "did:plc:alice" }]);
    expect(mention.index.byteStart).toBe(bytes("Café 📷\nby "));
    expect(mention.index.byteEnd).toBe(bytes("Café 📷\nby @alice.bsky.social"));
    expect(facets.at(-1)!.index.byteStart).toBe(bytes("Café 📷\nby @alice.bsky.social\n"));
    expect(facets.at(-1)!.index.byteEnd).toBe(bytes(text));
  });

  it("cuts a very long handle short but still mentions the uploader", () => {
    const long = { did: "did:plc:alice", handle: `${"a".repeat(240)}.example.com` };
    const credit = creditText(long.handle);
    expect(graphemeLength(credit)).toBe(4 + 60);
    expect(credit.endsWith("…")).toBe(true);
    const { text, facets } = buildPostText("", url, long);
    expect(text).toBe(`${credit}\n${linkText}`);
    expect(facets[0].features).toEqual([{ $type: "app.bsky.richtext.facet#mention", did: "did:plc:alice" }]);
    expect(maxCaptionGraphemes(url, long.handle)).toBeGreaterThan(100);
  });

  it("works with no caption", () => {
    const { text } = buildPostText("", url, credit);
    expect(text).toBe(`by @alice.bsky.social\n${linkText}`);
  });

  it("leaves room for the credit in the caption limit", () => {
    const max = maxCaptionGraphemes(url, credit.handle);
    expect(max).toBe(300 - graphemeLength(linkText) - 1 - graphemeLength(creditText(credit.handle)) - 1);
    expect(graphemeLength(buildPostText("a".repeat(max), url, credit).text)).toBe(300);
  });
});

describe("caption limit", () => {
  it("leaves room for the newline and link within 300 graphemes", () => {
    const max = maxCaptionGraphemes(url);
    expect(max).toBe(300 - graphemeLength(linkText) - 1);
    const { text } = buildPostText("a".repeat(max), url);
    expect(graphemeLength(text)).toBe(300);
  });

  it("strips the scheme from the link text", () => {
    expect(photoLinkText(url)).toBe(linkText);
  });

  it("counts graphemes, not code units", () => {
    expect(graphemeLength("👨‍👩‍👧📷é")).toBe(3);
  });
});
