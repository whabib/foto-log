"use server";

import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/admin-server";
import { getCurrentUser } from "@/lib/auth";
import { BanError, banMember, unbanMember } from "@/lib/bans-server";

export type BanResult = { ok: true } | { ok: false; message: string };

/** Bans or unbans `did`. Only admins can. */
export async function setBanned(did: string, banned: boolean): Promise<BanResult> {
  const user = await getCurrentUser();
  if (!user || !(await isAdmin(user.did))) return { ok: false, message: "Only admins can do that." };
  try {
    if (banned) await banMember(user.did, did);
    else await unbanMember(did);
  } catch (err) {
    if (err instanceof BanError) return { ok: false, message: err.message };
    console.error("Couldn't change a ban", { did, banned, err });
    return { ok: false, message: "That didn't work. Please try again." };
  }
  revalidatePath("/admin");
  return { ok: true };
}
