import { timingSafeEqual } from "node:crypto";
import { secret } from "@/lib/config";
import { indexTick } from "@/lib/photo-index-server";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

function authorized(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${secret("INDEX_TICK_SECRET", "dev-index-tick")}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * How far behind real time the index may fall before a tick reports
 * failure: five missed ticks. A failed tick returns 500, so Cloud Scheduler
 * records it as failed and alerts can count it.
 */
const MAX_LAG_SECONDS = 15 * 60;

/**
 * Runs the photo indexer once: catches up from Jetstream and backfills a
 * few members. Called every 3 minutes by Cloud Scheduler with the
 * INDEX_TICK_SECRET bearer token (docs/infra.md).
 */
export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const result = await indexTick();
    if (!result) {
      log.info("Index tick skipped: already running");
      return Response.json({ ok: true, skipped: "already running" });
    }
    if (result.catchUp.lagSeconds > MAX_LAG_SECONDS) {
      log.error("Index tick: the index is behind Jetstream", { ...result, maxLagSeconds: MAX_LAG_SECONDS });
      return Response.json({ ok: false, behind: true, ...result }, { status: 500 });
    }
    if (result.catchUp.stoppedBy === "error") log.warn("Index tick: Jetstream disconnected", result);
    else log.info("Index tick", result);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    log.error("Index tick failed", { err });
    return Response.json({ ok: false }, { status: 500 });
  }
}
