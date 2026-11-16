"use server";

import { isValidDid, isValidHandle } from "@atproto/syntax";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRoomForAccount, signOutOfBrowser } from "@/lib/auth";
import { startSignIn } from "@/lib/oauth/client";

/** Bluesky's sign-in server, used when no handle is given. */
const BLUESKY_ENTRYWAY = "https://bsky.social";

export async function signIn(formData: FormData) {
  const trimmed = String(formData.get("handle") ?? "").trim().replace(/^@/, "");
  // Handles are case-insensitive; DIDs (e.g. did:web paths) can be case-sensitive.
  const raw = isValidDid(trimmed) ? trimmed : trimmed.toLowerCase();
  if (raw && !isValidHandle(raw) && !isValidDid(raw)) {
    redirect("/login?error=invalid_handle");
  }
  // Signing in while signed in adds another account to this browser.
  const adding = (await getCurrentUser()) !== null;
  if (adding && !(await hasRoomForAccount())) redirect("/accounts?error=full");
  let url: URL;
  try {
    url = await startSignIn(raw || BLUESKY_ENTRYWAY, 0, { selectAccount: adding });
  } catch (err) {
    console.warn("Sign-in could not start", { input: raw, err });
    redirect(`/login?error=${raw ? "resolve_failed" : "failed"}`);
  }
  redirect(url.toString());
}

/**
 * Signs the current member in again, so they can grant permissions added
 * since they last signed in. Ends this session first; signing in again
 * makes a new one.
 */
export async function reauthorize() {
  const user = await getCurrentUser();
  await signOutOfBrowser(undefined, { switchToNext: false });
  if (!user) redirect("/login");
  let url: URL;
  try {
    url = await startSignIn(user.did);
  } catch (err) {
    console.warn("Re-authorization could not start", { did: user.did, err });
    redirect("/login?error=failed");
  }
  redirect(url.toString());
}
