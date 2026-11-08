"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { type SettingsField, validateMemberSettings } from "@/lib/member-settings";
import { resetMemberSettings, saveMemberSettings } from "@/lib/member-settings-server";

export type SaveState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; errors: Partial<Record<SettingsField, string>>; message?: string };

const FIELDS: SettingsField[] = ["title", "country", "region", "locality", "backgroundColor", "textColor"];

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
  try {
    await saveMemberSettings(user.did, result.value);
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
