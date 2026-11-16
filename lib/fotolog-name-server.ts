import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { member } from "@/lib/db/schema";
import { nameProblem, normalizeName } from "@/lib/fotolog-name";

/** A member's Fotolog name and whether it's their primary name. */
export const memberName = cache(async (did: string): Promise<{ name: string | null; primary: boolean }> => {
  const db = await getDb();
  const [row] = await db
    .select({ name: member.fotologName, show: member.showFotologName })
    .from(member)
    .where(eq(member.did, did))
    .limit(1);
  return { name: row?.name ?? null, primary: Boolean(row?.name && row.show) };
});

/** The member's Fotolog name if it's their primary name, else null (use their Bluesky handle). */
export async function primaryName(did: string): Promise<string | null> {
  const { name, primary } = await memberName(did);
  return primary ? name : null;
}

/** The primary Fotolog names of those among `dids` who show one, by DID. */
export async function primaryNames(dids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(dids)];
  if (unique.length === 0) return new Map();
  const db = await getDb();
  const rows = await db
    .select({ did: member.did, name: member.fotologName, show: member.showFotologName })
    .from(member)
    .where(inArray(member.did, unique));
  return new Map(rows.flatMap((r) => (r.name && r.show ? [[r.did, r.name] as const] : [])));
}

/** The DID that holds `name` (already normalized), or null. */
export const didForName = cache(async (name: string): Promise<string | null> => {
  const db = await getDb();
  const [row] = await db.select({ did: member.did }).from(member).where(eq(member.fotologName, name)).limit(1);
  return row?.did ?? null;
});

export type SetNameResult = { ok: true; name: string } | { ok: false; message: string };

/** Whether `input` could be set as a Fotolog name right now. */
export async function checkName(input: string): Promise<SetNameResult> {
  const name = normalizeName(input);
  const problem = nameProblem(name);
  if (problem) return { ok: false, message: problem };
  if (await didForName(name)) return { ok: false, message: "That name is taken." };
  return { ok: true, name };
}

/**
 * Sets the member's Fotolog name, once, and makes it their primary name.
 * Names are never released, so a name stays with its member for good.
 */
export async function setFotologName(did: string, input: string): Promise<SetNameResult> {
  const checked = await checkName(input);
  if (!checked.ok) return checked;
  const db = await getDb();
  try {
    const updated = await db
      .update(member)
      .set({ fotologName: checked.name, showFotologName: true })
      .where(and(eq(member.did, did), isNull(member.fotologName)))
      .returning({ did: member.did });
    if (updated.length === 0) return { ok: false, message: "Your Fotolog name is already set." };
  } catch (err) {
    // Someone else took it between the check and the update.
    if ((err as { code?: string }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505") {
      return { ok: false, message: "That name is taken." };
    }
    throw err;
  }
  return checked;
}

/** Chooses whether the member's Fotolog name or Bluesky handle is their primary name. */
export async function setShowFotologName(did: string, show: boolean): Promise<void> {
  const db = await getDb();
  await db.update(member).set({ showFotologName: show }).where(eq(member.did, did));
}
