import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Health check: the app is up and can query the database. */
export async function GET() {
  try {
    const pool = await getPool();
    const { rows } = await pool.query<{ migrations: string }>(
      "SELECT count(*) AS migrations FROM drizzle.__drizzle_migrations",
    );
    return Response.json(
      { ok: true, migrations: Number(rows[0].migrations) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("Health check failed", err);
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
