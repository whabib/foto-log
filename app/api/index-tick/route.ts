import { timingSafeEqual } from "node:crypto";
import { secret } from "@/lib/config";
import { indexTick } from "@/lib/photo-index-server";

export const dynamic = "force-dynamic";

function authorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${secret("INDEX_TICK_SECRET", "dev-index-tick")}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Runs the photo indexer once: catches up from Jetstream and backfills a
 * few members. Called every 5 minutes by Cloud Scheduler with the
 * INDEX_TICK_SECRET bearer token (docs/infra.md).
 */
export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await indexTick();
    if (!result) return Response.json({ ok: true, skipped: "already running" });
    console.log("Index tick", JSON.stringify(result));
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("Index tick failed", err);
    return Response.json({ ok: false }, { status: 500 });
  }
}
