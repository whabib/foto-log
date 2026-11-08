import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_TEXT_COLOR,
  defaultTitle,
  isHexColor,
  memberPageLook,
  validateMemberSettings,
} from "./member-settings";

const blank = { title: "", country: "", region: "", locality: "", backgroundColor: "", textColor: "" };
const member = { did: "did:plc:abc", handle: "alice.bsky.social" };

describe("validateMemberSettings", () => {
  it("turns blank fields into defaults (null)", () => {
    expect(validateMemberSettings(blank)).toEqual({
      ok: true,
      value: { title: null, country: null, region: null, locality: null, backgroundColor: null, textColor: null },
    });
  });

  it("accepts a full set and normalizes it", () => {
    const r = validateMemberSettings({
      title: "  Alice's   daily  photos ",
      country: "us",
      region: "US-TX",
      locality: " Austin ",
      backgroundColor: "#1A1A1A",
      textColor: "#F5F5F5",
    });
    expect(r).toEqual({
      ok: true,
      value: {
        title: "Alice's daily photos",
        country: "US",
        region: "US-TX",
        locality: "Austin",
        backgroundColor: "#1a1a1a",
        textColor: "#f5f5f5",
      },
    });
  });

  it("limits the title to 64 characters, counting emoji as one", () => {
    expect(validateMemberSettings({ ...blank, title: "a".repeat(64) }).ok).toBe(true);
    expect(validateMemberSettings({ ...blank, title: "📷".repeat(64) }).ok).toBe(true);
    const r = validateMemberSettings({ ...blank, title: "a".repeat(65) });
    expect(r.ok === false && r.errors.title).toMatch(/64/);
  });

  it("rejects bad colors", () => {
    for (const c of ["red", "#fff", "#1234567", "123456", "#12345g"]) {
      const r = validateMemberSettings({ ...blank, backgroundColor: c });
      expect(r.ok === false && r.errors.backgroundColor, c).toBeTruthy();
    }
  });

  it("rejects unknown countries and region codes from the wrong list", () => {
    const a = validateMemberSettings({ ...blank, country: "XX" });
    expect(a.ok === false && a.errors.country).toBeTruthy();
    const b = validateMemberSettings({ ...blank, country: "US", region: "CA-ON" });
    expect(b.ok === false && b.errors.region).toBeTruthy();
    const c = validateMemberSettings({ ...blank, country: "US", region: "Texas" });
    expect(c.ok === false && c.errors.region).toBeTruthy();
  });

  it("takes free-text regions for countries without a list", () => {
    const r = validateMemberSettings({ ...blank, country: "FR", region: "Bretagne", locality: "Rennes" });
    expect(r.ok && r.value).toMatchObject({ country: "FR", region: "Bretagne", locality: "Rennes" });
    const long = validateMemberSettings({ ...blank, country: "FR", region: "x".repeat(101) });
    expect(long.ok === false && long.errors.region).toBeTruthy();
  });

  it("needs a country when a city or region is given", () => {
    const r = validateMemberSettings({ ...blank, locality: "Austin" });
    expect(r.ok === false && r.errors.country).toBeTruthy();
  });
});

describe("colors", () => {
  it("recognizes #RRGGBB", () => {
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(isHexColor("#abc")).toBe(false);
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio(DEFAULT_BACKGROUND_COLOR, DEFAULT_TEXT_COLOR)).toBeGreaterThan(4.5);
  });
});

describe("memberPageLook", () => {
  it("fills in defaults when nothing is saved", () => {
    expect(memberPageLook(null, member)).toEqual({
      title: "alice.bsky.social's Fotolog",
      location: null,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
      textColor: DEFAULT_TEXT_COLOR,
    });
  });

  it("uses saved values and formats the location", () => {
    expect(
      memberPageLook(
        {
          title: "Daily",
          country: "US",
          region: "US-TX",
          locality: "Austin",
          backgroundColor: "#000000",
          textColor: "#ffffff",
        },
        member,
      ),
    ).toEqual({ title: "Daily", location: "Austin, TX, United States", backgroundColor: "#000000", textColor: "#ffffff" });
  });

  it("falls back to the DID in the default title when there's no verified handle", () => {
    expect(defaultTitle({ did: "did:plc:abc", handle: null })).toBe("did:plc:abc's Fotolog");
  });
});
