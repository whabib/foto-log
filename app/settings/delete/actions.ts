"use server";

import { redirect } from "next/navigation";
import { confirmsDelete } from "@/lib/account-delete";
import { DeleteAccountError, deleteFotologRecords, forgetMember, forgetTokens } from "@/lib/account-delete-server";
import { isBuiltInAdminStrict } from "@/lib/admin-server";
import { browserAccounts, endAllSessions, getCurrentUser, signOutOfBrowser, switchAccount } from "@/lib/auth";
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
    if (await isBuiltInAdminStrict(user.did)) throw new DeleteAccountError("This account runs Fotolog and can't be deleted.");
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
  // Every session is already gone with the foto-log, and getCurrentUser refuses a closed account.
  // Now the cookies: this browser moves to another account it holds, if any. Then the tokens.
  try {
    const [next] = await browserAccounts();
    if (next) await switchAccount(next.did);
    else await signOutOfBrowser();
  } catch (err) {
    console.warn("Switching accounts after delete failed", { err });
  }
  await endAllSessions(user.did).catch((err) => console.warn("Revoking tokens after delete failed", { err }));
  await forgetTokens(user.did).catch((err) => console.warn("Dropping tokens after delete failed", { err }));
  redirect(deleteRecords ? "/goodbye" : "/goodbye?kept=1");
}
