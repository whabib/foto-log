import { describe, expect, it } from "vitest";
import { fetchFromPds } from "./safe-fetch";

describe("fetchFromPds", () => {
  it.each([
    "http://127.0.0.1:8080/xrpc/x",
    "https://169.254.169.254/computeMetadata/v1/",
    "https://10.0.0.1/xrpc/x",
    "https://[::1]/xrpc/x",
    "https://localhost/xrpc/x",
  ])("refuses internal destination %s", async (url) => {
    await expect(fetchFromPds(new URL(url))).rejects.toThrow();
  });
});
