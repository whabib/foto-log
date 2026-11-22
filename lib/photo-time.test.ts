import { describe, expect, it } from "vitest";
import { formatPhotoTime } from "./photo-time";

const iso = "2026-11-17T16:57:00.000Z";

describe("formatPhotoTime", () => {
  it("uses the poster's zone and its common short name", () => {
    expect(formatPhotoTime(iso, "America/New_York")).toBe("Nov 17, 2026, 11:57 AM ET");
    expect(formatPhotoTime(iso, "America/Los_Angeles")).toBe("Nov 17, 2026, 8:57 AM PT");
  });

  it("uses a GMT offset where the zone has no short name", () => {
    expect(formatPhotoTime(iso, "Europe/Berlin")).toBe("Nov 17, 2026, 5:57 PM GMT+1");
    expect(formatPhotoTime(iso, "Asia/Tokyo")).toBe("Nov 18, 2026, 1:57 AM GMT+9");
  });

  it("falls back to UTC for an unknown zone", () => {
    expect(formatPhotoTime(iso, "Not/AZone")).toBe("Nov 17, 2026, 4:57 PM UTC");
  });
});
