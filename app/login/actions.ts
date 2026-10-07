"use server";

import { isValidDid, isValidHandle } from "@atproto/syntax";
import { redirect } from "next/navigation";
import { endUserSession } from "@/lib/auth";
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
  let url: URL;
  try {
    url = await startSignIn(raw || BLUESKY_ENTRYWAY);
  } catch (err) {
    console.warn("Sign-in could not start", { input: raw, err });
    redirect(`/login?error=${raw ? "resolve_failed" : "failed"}`);
  }
  redirect(url.toString());
}

export async function signOut() {
  await endUserSession();
  redirect("/");
}
