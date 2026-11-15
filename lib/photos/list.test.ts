import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFromPds = vi.fn();
vi.mock("@/lib/safe-fetch", () => ({ fetchFromPds: (url: URL) => fetchFromPds(url) }));
vi.mock("@/lib/oauth/client", () => ({ getOAuthClient: vi.fn() }));
vi.mock("@/lib/identity", () => ({ resolveActor: vi.fn() }));
vi.mock("@/lib/config", () => ({ baseUrl: "https://foto-log.com" }));
vi.mock("@/lib/photo-record", async (orig) => ({
  ...(await orig<typeof import("@/lib/photo-record")>()),
  // Records marked bad fail validation; everything else passes.
  assertValidPhotoRecord: (_rkey: string, record: { bad?: boolean }) => {
    if (record.bad) throw new Error("invalid");
  },
}));

const { listPhotos } = await import("./server");
const actor = { did: "did:plc:abc", handle: "alice.test", pds: new URL("https://pds.example") };
const rec = (rkey: string, bad = false) => ({
  uri: `at://did:plc:abc/com.foto-log.photo/${rkey}`,
  cid: "c",
  value: { bad },
});
const page = (records: unknown[], cursor?: string) =>
  new Response(JSON.stringify({ records, cursor }), { headers: { "content-type": "application/json" } });

describe("listPhotos", () => {
  beforeEach(() => fetchFromPds.mockReset());

  it("reads further pages when records are invalid", async () => {
    fetchFromPds
      .mockResolvedValueOnce(page([rec("2026-11-15-01"), rec("2026-11-14-01", true)], "2026-11-14-01"))
      .mockResolvedValueOnce(page([rec("2026-11-13-01")], "2026-11-13-01"));
    const photos = await listPhotos(actor, { limit: 2 });
    expect(photos.map((p) => p.rkey)).toEqual(["2026-11-15-01", "2026-11-13-01"]);
    const second = fetchFromPds.mock.calls[1][0] as URL;
    expect(second.searchParams.get("cursor")).toBe("2026-11-14-01");
    expect(second.searchParams.get("limit")).toBe("1");
  });

  it("finds the next valid neighbor past an invalid one, newer side ascending", async () => {
    fetchFromPds
      .mockResolvedValueOnce(page([rec("2026-11-11-01", true)], "2026-11-11-01"))
      .mockResolvedValueOnce(page([rec("2026-11-12-01")], "2026-11-12-01"));
    const photos = await listPhotos(actor, { limit: 1, after: "2026-11-10-01" });
    expect(photos.map((p) => p.rkey)).toEqual(["2026-11-12-01"]);
    const first = fetchFromPds.mock.calls[0][0] as URL;
    expect(first.searchParams.get("reverse")).toBe("true");
    expect(first.searchParams.get("cursor")).toBe("2026-11-10-01");
  });

  it("stops when the collection runs out", async () => {
    fetchFromPds.mockResolvedValueOnce(page([rec("2026-11-15-01", true)]));
    expect(await listPhotos(actor, { limit: 6 })).toEqual([]);
    expect(fetchFromPds).toHaveBeenCalledTimes(1);
  });
});
