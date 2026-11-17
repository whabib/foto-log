"use server";

import { redirect } from "next/navigation";
import { confirmsDelete } from "@/lib/account-delete";
import { DeleteAccountError, deleteFotologRecords, forgetMember, forgetTokens } from "@/lib/account-delete-server";
import { isBuiltInAdmin } from "@/lib/admin-server";
import { endAllSessions, getCurrentUser, signOutOfBrowser } from "@/lib/auth";
import { resolveActor } from "@/lib/identity";
import { agentFor, PhotoError } from "@/lib/photos/server";

export type DeleteState = { status: "idle" } | { status: "error"; message: string };

/**
 * Deletes the signed-in member's foto-log: with `deleteRecords`, first their
 * foto-log records in their repository, then everything foto-log holds, then
 * every session and their tokens.
 */
export async function deleteAccountAction(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const actor = await resolveActor(user.did).catch(() => null);
  const handle = actor?.handle ?? user.handle;
  if (!confirmsDelete(String(form.get("confirm") ?? ""), handle, user.did)) {
    return { status: "error", message: `Type ${handle ? `@${handle}` : "your DID"} to confirm.` };
  }
  const deleteRecords = form.get("deleteRecords") === "on";
  try {
    if (await isBuiltInAdmin(user.did)) throw new DeleteAccountError("This account runs foto-log and can't be deleted.");
    if (deleteRecords) {
      // Before anything else, so a failure here leaves the foto-log as it was to try again.
      const agent = await agentFor(user.did);
      await deleteFotologRecords(agent, user.did);
    }
    await forgetMember(user.did);
  } catch (err) {
    if (err instanceof DeleteAccountError || err instanceof PhotoError) return { status: "error", message: err.message };
    console.error("Deleting an account failed", { did: user.did, err });
    return {
      status: "error",
      message: deleteRecords
        ? "We couldn't delete everything from your Bluesky repository. Nothing else was deleted. Please try again."
        : "Something went wrong. Nothing was deleted. Please try again.",
    };
  }
  // The foto-log is gone; now every sign-in. This browser moves to another account it holds, if any.
  await signOutOfBrowser(user.did).catch((err) => console.warn("Sign-out after delete failed", { err }));
  await endAllSessions(user.did).catch((err) => console.warn("Ending sessions after delete failed", { err }));
  await forgetTokens(user.did).catch((err) => console.warn("Dropping tokens after delete failed", { err }));
  redirect(deleteRecords ? "/goodbye" : "/goodbye?kept=1");
}
