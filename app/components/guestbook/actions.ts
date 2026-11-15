"use server";

import { getCurrentUser } from "@/lib/auth";
import { GuestbookError, signGuestbook } from "@/lib/guestbook/server";
import { resolveActor } from "@/lib/identity";
import { parsePhotoRecordKey } from "@/lib/photo-record";
import { fetchPhoto } from "@/lib/photos/server";

export type SignState = { status: "idle" } | { status: "signed" } | { status: "error"; message: string; login?: boolean };

/**
 * Signs the guestbook of `ownerDid`'s photo `rkey` as the signed-in user.
 * The reply target comes from the photo record itself, not the form, and
 * must be a post in the owner's own repository, so this can only reply to
 * that member's foto-log photo posts.
 */
export async function signGuestbookAction(
  ownerDid: string,
  rkey: string,
  _prev: SignState,
  form: FormData,
): Promise<SignState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Sign in to sign this guestbook.", login: true };
  if (!parsePhotoRecordKey(rkey)) return { status: "error", message: "That photo can't be found." };
  const owner = await resolveActor(ownerDid);
  const photo = owner ? await fetchPhoto(owner, rkey) : null;
  if (!photo) return { status: "error", message: "That photo can't be found." };
  try {
    await signGuestbook(user, owner!.did, photo.record.post, String(form.get("text") ?? ""));
  } catch (err) {
    if (err instanceof GuestbookError) {
      return { status: "error", message: err.message, login: err.code === "session_expired" };
    }
    console.error("Signing guestbook failed", { did: user.did, rkey, err });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  return { status: "signed" };
}
