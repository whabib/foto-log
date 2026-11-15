import { formatLocation, isCountryCode, isRegionCode, SUBDIVISIONS } from "@/lib/geo";

/** Defaults match the site's light theme. */
export const DEFAULT_BACKGROUND_COLOR = "#ffffff";
export const DEFAULT_TEXT_COLOR = "#1a1a1a";
export const MAX_TITLE_GRAPHEMES = 64;
export const MAX_PLACE_GRAPHEMES = 100;
/** WCAG AA contrast for normal-size text. */
export const MIN_CONTRAST = 4.5;

/** Settings as stored. Null means "use the default". */
export type MemberSettings = {
  title: string | null;
  country: string | null;
  region: string | null;
  locality: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  linkColor: string | null;
};

export const EMPTY_SETTINGS: MemberSettings = {
  title: null,
  country: null,
  region: null,
  locality: null,
  backgroundColor: null,
  textColor: null,
  linkColor: null,
};

export type SettingsField = keyof MemberSettings;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = (s: string) => Array.from(segmenter.segment(s)).length;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

/** "alice.bsky.social's Fotolog" */
export function defaultTitle(member: { handle: string | null; did: string }): string {
  return `${member.handle ?? member.did}'s Fotolog`;
}

/**
 * Checks and normalizes form input. Blank fields become null (default).
 * Returns per-field error messages if anything is invalid.
 */
export function validateMemberSettings(
  input: Record<SettingsField, string | null | undefined>,
): { ok: true; value: MemberSettings } | { ok: false; errors: Partial<Record<SettingsField, string>> } {
  const errors: Partial<Record<SettingsField, string>> = {};
  const clean = (s: string | null | undefined) => {
    const t = (s ?? "").trim().replace(/\s+/g, " ");
    return t === "" ? null : t;
  };

  const title = clean(input.title);
  if (title && graphemes(title) > MAX_TITLE_GRAPHEMES) {
    errors.title = `The title can be up to ${MAX_TITLE_GRAPHEMES} characters.`;
  }

  const country = clean(input.country)?.toUpperCase() ?? null;
  if (country && !isCountryCode(country)) errors.country = "Choose a country from the list.";

  let region = clean(input.region);
  if (region && country && SUBDIVISIONS[country]) {
    if (!isRegionCode(country, region)) errors.region = "Choose one from the list.";
  } else if (region && graphemes(region) > MAX_PLACE_GRAPHEMES) {
    errors.region = `This can be up to ${MAX_PLACE_GRAPHEMES} characters.`;
  }

  const locality = clean(input.locality);
  if (locality && graphemes(locality) > MAX_PLACE_GRAPHEMES) {
    errors.locality = `This can be up to ${MAX_PLACE_GRAPHEMES} characters.`;
  }
  if ((region || locality) && !country) errors.country = "Choose a country for this location.";
  if (!country) region = null;

  const color = (field: "backgroundColor" | "textColor" | "linkColor") => {
    const v = clean(input[field]);
    if (v && !isHexColor(v)) {
      errors[field] = "Use a hex color like #1a1a1a.";
      return null;
    }
    return v?.toLowerCase() ?? null;
  };
  const backgroundColor = color("backgroundColor");
  const textColor = color("textColor");
  const linkColor = color("linkColor");

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { title, country, region, locality, backgroundColor, textColor, linkColor } };
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colors, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** What the member page actually shows: saved settings with defaults filled in. */
export type MemberPageLook = {
  title: string;
  location: string | null;
  backgroundColor: string;
  textColor: string;
  /** Links; hovering shows them in the text color. */
  linkColor: string;
};

export function memberPageLook(
  settings: MemberSettings | null,
  member: { handle: string | null; did: string },
): MemberPageLook {
  const s = settings ?? EMPTY_SETTINGS;
  return {
    title: s.title ?? defaultTitle(member),
    location: s.country
      ? formatLocation({ country: s.country, region: s.region, locality: s.locality })
      : null,
    backgroundColor: s.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    textColor: s.textColor ?? DEFAULT_TEXT_COLOR,
    // Unset, links match the text, as they did before this setting existed.
    linkColor: s.linkColor ?? s.textColor ?? DEFAULT_TEXT_COLOR,
  };
}
