"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { parsePhotoRecordKey } from "@/lib/photo-record";
import { deletePhoto, PhotoError } from "@/lib/photos/server";

/** Deletes one of the signed-in user's photos and its Bluesky post. */
export async function deletePhotoAction(rkey: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!parsePhotoRecordKey(rkey)) throw new Error("Invalid photo key");
  try {
    await deletePhoto(user, rkey);
  } catch (err) {
    if (err instanceof PhotoError && err.code === "session_expired") redirect("/login");
    if (!(err instanceof PhotoError && err.code === "not_found")) throw err;
  }
  redirect("/post");
}
