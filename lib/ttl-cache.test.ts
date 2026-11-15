import { describe, expect, it } from "vitest";
import { TtlCache } from "./ttl-cache";

describe("TtlCache", () => {
  it("returns values until they expire, including cached nulls", () => {
    let t = 0;
    const c = new TtlCache<string, string | null>(1000, 10, () => t);
    c.set("a", null);
    expect(c.get("a")).toEqual({ value: null });
    t = 999;
    expect(c.get("a")).toEqual({ value: null });
    t = 1000;
    expect(c.get("a")).toBeUndefined();
    expect(c.size).toBe(0);
  });

  it("never grows past its cap, dropping expired entries first, then the oldest", () => {
    let t = 0;
    const c = new TtlCache<number, number>(100, 3, () => t);
    c.set(1, 1);
    t = 50;
    c.set(2, 2);
    c.set(3, 3);
    t = 120; // 1 has expired
    c.set(4, 4);
    expect(c.size).toBe(3);
    expect(c.get(1)).toBeUndefined();
    expect(c.get(2)).toEqual({ value: 2 });
    c.set(5, 5); // full, none expired: drop the oldest (2)
    expect(c.size).toBe(3);
    expect(c.get(2)).toBeUndefined();
    for (let i = 0; i < 1000; i++) c.set(100 + i, i);
    expect(c.size).toBe(3);
  });

  it("refreshes an entry when it's set again, and deletes on request", () => {
    let t = 0;
    const c = new TtlCache<string, number>(100, 2, () => t);
    c.set("a", 1);
    t = 90;
    c.set("a", 2);
    t = 150;
    expect(c.get("a")).toEqual({ value: 2 });
    c.delete("a");
    expect(c.get("a")).toBeUndefined();
  });
});
