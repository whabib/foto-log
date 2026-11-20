import { getPool } from "@/lib/db";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Health check (not /healthz, which Cloud Run reserves): the app is up and can query the database. */
export async function GET() {
  try {
    const pool = await getPool();
    const { rows } = await pool.query<{ migrations: string }>(
      "SELECT count(*) AS migrations FROM drizzle.__drizzle_migrations",
    );
    return Response.json(
      // The Cloud Run revision answering, so a deploy can tell the new revision is serving.
      { ok: true, migrations: Number(rows[0].migrations), revision: process.env.K_REVISION ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    log.error("Health check failed", { err });
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
