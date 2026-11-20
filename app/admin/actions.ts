"use server";

import { revalidatePath } from "next/cache";
import { AdminError, isAdmin, setAdmin } from "@/lib/admin-server";
import { getCurrentUser } from "@/lib/auth";
import { BanError, banMember, unbanMember } from "@/lib/bans-server";
import { log } from "@/lib/log";

export type MemberChange = "ban" | "unban" | "make-admin" | "remove-admin";
export type ChangeResult = { ok: true } | { ok: false; message: string };

/** Bans (for `reason`), unbans, or makes or removes an admin. Only admins can. */
export async function changeMember(did: string, change: MemberChange, reason = ""): Promise<ChangeResult> {
  const user = await getCurrentUser();
  if (!user || !(await isAdmin(user.did))) return { ok: false, message: "Only admins can do that." };
  try {
    if (change === "ban") await banMember(user.did, did, typeof reason === "string" ? reason : "");
    else if (change === "unban") await unbanMember(did);
    else if (change === "make-admin") await setAdmin(user.did, did, true);
    else if (change === "remove-admin") await setAdmin(user.did, did, false);
    else return { ok: false, message: "That isn't something the admin page can do." };
  } catch (err) {
    if (err instanceof BanError || err instanceof AdminError) return { ok: false, message: err.message };
    log.error("Couldn't change a member", { did, change, err });
    return { ok: false, message: "That didn't work. Please try again." };
  }
  revalidatePath("/admin");
  return { ok: true };
}
