"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { type SettingsField, validateMemberSettings } from "@/lib/member-settings";
import { resetMemberSettings, saveMemberSettings } from "@/lib/member-settings-server";
import { checkName, memberName, type SetNameResult, setFotologName, setShowFotologName } from "@/lib/fotolog-name-server";

export type SaveState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; errors: Partial<Record<SettingsField, string>>; message?: string };

const FIELDS: SettingsField[] = ["title", "country", "region", "locality", "backgroundColor", "textColor", "linkColor"];

/** Saves the signed-in member's own settings. */
export async function saveSettings(_prev: SaveState, form: FormData): Promise<SaveState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const input = Object.fromEntries(FIELDS.map((f) => [f, form.get(f)?.toString() ?? null])) as Record<
    SettingsField,
    string | null
  >;
  const result = validateMemberSettings(input);
  if (!result.ok) return { status: "error", errors: result.errors };
  // Only members with a Fotolog name get the choice.
  const primary = form.get("primaryName")?.toString();
  try {
    await saveMemberSettings(user.did, result.value);
    if (primary === "fotolog" || primary === "bluesky") {
      const { name } = await memberName(user.did);
      if (name) await setShowFotologName(user.did, primary === "fotolog");
    }
  } catch (err) {
    console.error("Saving member settings failed", { did: user.did, err });
    return { status: "error", errors: {}, message: "Something went wrong saving. Please try again." };
  }
  revalidatePath("/settings");
  return { status: "saved" };
}

/** Clears the signed-in member's settings back to the defaults. */
export async function resetSettings() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  await resetMemberSettings(user.did);
  revalidatePath("/settings");
  // A fresh value each time, so the page remounts the form with the defaults.
  redirect(`/settings?reset=${Date.now()}`);
}

/** Whether a Fotolog name is free to take, for the live check as the member types. */
export async function checkFotologName(input: string): Promise<SetNameResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  return checkName(String(input).slice(0, 100));
}

/** Sets the signed-in member's Fotolog name. It can only be done once. */
export async function claimFotologName(input: string): Promise<SetNameResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  try {
    const result = await setFotologName(user.did, String(input).slice(0, 100));
    if (result.ok) revalidatePath("/settings");
    return result;
  } catch (err) {
    console.error("Setting Fotolog name failed", { did: user.did, err });
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}
