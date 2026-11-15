import { describe, expect, it } from "vitest";
import {
  COUNTRY_CODES,
  countryName,
  countryOptions,
  formatLocation,
  isCountryCode,
  isRegionCode,
  regionLabel,
  regionOptions,
  SUBDIVISIONS,
} from "./geo";

describe("countries", () => {
  it("has all 249 ISO 3166-1 alpha-2 codes, each with a real name", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    for (const code of COUNTRY_CODES) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(countryName(code), code).not.toBe(code);
    }
  });

  it("names and sorts them in English", () => {
    expect(countryName("US")).toBe("United States");
    expect(countryName("FR")).toBe("France");
    const names = countryOptions().map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("rejects codes that aren't countries", () => {
    expect(isCountryCode("US")).toBe(true);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("us")).toBe(false);
    expect(isCountryCode("EU")).toBe(false);
  });
});

describe("regions", () => {
  it("has full lists for the six countries", () => {
    const sizes = Object.fromEntries(Object.entries(SUBDIVISIONS).map(([c, s]) => [c, Object.keys(s.list).length]));
    expect(sizes).toEqual({ US: 51, CA: 13, AU: 8, BR: 27, MX: 32, IN: 36 });
  });

  it("uses ISO 3166-2 codes", () => {
    expect(isRegionCode("US", "US-TX")).toBe(true);
    expect(isRegionCode("CA", "CA-QC")).toBe(true);
    expect(isRegionCode("MX", "MX-JAL")).toBe(true);
    expect(isRegionCode("US", "TX")).toBe(false);
    expect(isRegionCode("US", "CA-ON")).toBe(false);
    expect(isRegionCode("US", "US-toString")).toBe(false);
    expect(isRegionCode("FR", "FR-75")).toBe(false);
  });

  it("labels the field per country and offers a list only where there is one", () => {
    expect(regionLabel("US")).toBe("State");
    expect(regionLabel("CA")).toBe("Province or territory");
    expect(regionLabel("FR")).toBe("State, province or region");
    expect(regionOptions("FR")).toBeNull();
    expect(regionOptions("US")?.[0]).toEqual({ code: "US-AL", name: "Alabama" });
  });
});

describe("formatLocation", () => {
  it.each([
    [{ country: "US", region: "US-TX", locality: "Austin" }, "Austin, TX, United States"],
    [{ country: "CA", region: "CA-ON", locality: "Toronto" }, "Toronto, ON, Canada"],
    [{ country: "AU", region: "AU-NSW", locality: "Sydney" }, "Sydney, NSW, Australia"],
    [{ country: "BR", region: "BR-SP", locality: "São Paulo" }, "São Paulo, SP, Brazil"],
    [{ country: "MX", region: "MX-JAL", locality: "Guadalajara" }, "Guadalajara, Jalisco, Mexico"],
    [{ country: "IN", region: "IN-MH", locality: "Mumbai" }, "Mumbai, Maharashtra, India"],
    [{ country: "FR", locality: "Lyon" }, "Lyon, France"],
    [{ country: "FR", region: "Auvergne-Rhône-Alpes", locality: "Lyon" }, "Lyon, Auvergne-Rhône-Alpes, France"],
    [{ country: "US", region: "US-OR" }, "OR, United States"],
    [{ country: "JP" }, "Japan"],
  ])("%j -> %s", (loc, expected) => {
    expect(formatLocation(loc)).toBe(expected);
  });

  it("drops a region code that doesn't belong to the country", () => {
    expect(formatLocation({ country: "US", region: "Texas", locality: "Austin" })).toBe("Austin, United States");
  });
});
