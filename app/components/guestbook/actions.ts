"use server";

import { type CurrentUser, getCurrentUser } from "@/lib/auth";
import { WHO_CAN_SIGN_CHOICES, type WhoCanSignChoice } from "@/lib/guestbook/entries";
import { GuestbookError, hideEntry, setWhoCanSign, signGuestbook } from "@/lib/guestbook/server";
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

export type OwnerState = { status: "idle" } | { status: "done" } | { status: "error"; message: string; login?: boolean };

/**
 * Runs an owner-only guestbook change on `ownerDid`'s photo `rkey`. The
 * post comes from the photo record, and the change is refused unless the
 * signed-in user is that owner.
 */
async function ownerAction(
  ownerDid: string,
  rkey: string,
  run: (user: CurrentUser, ownerDid: string, postUri: string) => Promise<void>,
): Promise<OwnerState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Please sign in again.", login: true };
  if (user.did !== ownerDid) return { status: "error", message: "Only the owner of this photo can do that." };
  if (!parsePhotoRecordKey(rkey)) return { status: "error", message: "That photo can't be found." };
  const owner = await resolveActor(ownerDid);
  const photo = owner ? await fetchPhoto(owner, rkey) : null;
  if (!photo) return { status: "error", message: "That photo can't be found." };
  try {
    await run(user, owner!.did, photo.record.post.uri);
  } catch (err) {
    if (err instanceof GuestbookError) {
      return { status: "error", message: err.message, login: err.code === "session_expired" };
    }
    console.error("Guestbook owner change failed", { did: user.did, rkey, err });
    return { status: "error", message: "Something went wrong. Please try again." };
  }
  return { status: "done" };
}

/** Hides one entry from the guestbook of the owner's photo `rkey`. */
export async function hideEntryAction(ownerDid: string, rkey: string, entryUri: string): Promise<OwnerState> {
  return ownerAction(ownerDid, rkey, (user, did, postUri) => hideEntry(user, did, postUri, entryUri));
}

/** Sets who can sign the guestbook of the owner's photo `rkey`. */
export async function setWhoCanSignAction(
  ownerDid: string,
  rkey: string,
  _prev: OwnerState,
  form: FormData,
): Promise<OwnerState> {
  const who = String(form.get("who") ?? "");
  if (!(WHO_CAN_SIGN_CHOICES as readonly string[]).includes(who)) {
    return { status: "error", message: "Pick who can sign." };
  }
  return ownerAction(ownerDid, rkey, (user, did, postUri) =>
    setWhoCanSign(user, did, postUri, who as WhoCanSignChoice),
  );
}
