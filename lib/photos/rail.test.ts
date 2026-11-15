import { describe, expect, it } from "vitest";
import { railWindow } from "./rail";

const p = (n: number) => ({ rkey: String(n).padStart(2, "0") });
const keys = (xs: { rkey: string }[]) => xs.map((x) => Number(x.rkey));
// Photos 1..20, newest is 20.
const recent = [20, 19, 18, 17, 16, 15].map(p);

describe("railWindow", () => {
  it("shows the newest photos when the current one is among them", () => {
    expect(keys(railWindow(recent, p(17), [p(18)], [p(16)], 6))).toEqual([20, 19, 18, 17, 16, 15]);
    expect(keys(railWindow(recent, null, [], [], 6))).toEqual([20, 19, 18, 17, 16, 15]);
  });

  it("centers on an older current photo, two newer above it", () => {
    const newer = [11, 12, 13, 14, 15].map(p);
    const older = [9, 8, 7, 6, 5].map(p);
    expect(keys(railWindow(recent, p(10), newer, older, 6))).toEqual([12, 11, 10, 9, 8, 7]);
  });

  it("fills with newer photos near the start of the fotolog", () => {
    const newer = [3, 4, 5, 6, 7].map(p);
    const older = [1].map(p);
    expect(keys(railWindow(recent, p(2), newer, older, 6))).toEqual([6, 5, 4, 3, 2, 1]);
  });
});
