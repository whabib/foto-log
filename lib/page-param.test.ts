import { describe, expect, it } from "vitest";
import { pageParam } from "./page-param";

describe("pageParam", () => {
  it("takes whole page numbers", () => {
    expect(pageParam("3")).toBe(3);
  });
  it("falls back to page 1 for anything else", () => {
    for (const v of [undefined, ["2"], "", "0", "-1", "1.5", "abc", "Infinity", "1e309", "99999999"]) {
      expect(pageParam(v)).toBe(1);
    }
  });
});
