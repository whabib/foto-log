"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { type SettingsField, validateMemberSettings } from "@/lib/member-settings";
import { getMemberSettings, updateMemberSettings } from "@/lib/member-settings-server";
import { approveRequest, leaveGroup, setGroup } from "@/lib/groups-server";
import { checkName, memberName, type SetNameResult, setFotologName, setShowFotologName } from "@/lib/fotolog-name-server";
import { log } from "@/lib/log";

export type SaveState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; errors: Partial<Record<SettingsField, string>>; message?: string };

/** Which settings each page's form saves; the rest keep their saved values. */
const SECTION_FIELDS: Record<"profile" | "page", SettingsField[]> = {
  profile: ["country", "region", "locality"],
  page: ["title", "backgroundColor", "textColor", "linkColor"],
};

/** Saves the settings on one Settings page (the form's `section`) for the signed-in member. */
export async function saveSettings(_prev: SaveState, form: FormData): Promise<SaveState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const section = form.get("section") === "profile" ? "profile" : "page";
  const saved = await getMemberSettings(user.did);
  const input = Object.fromEntries(
    (Object.values(SECTION_FIELDS).flat() as SettingsField[]).map((f) => [
      f,
      SECTION_FIELDS[section].includes(f) ? (form.get(f)?.toString() ?? null) : (saved?.[f] ?? null),
    ]),
  ) as Record<SettingsField, string | null>;
  const result = validateMemberSettings(input);
  if (!result.ok) return { status: "error", errors: result.errors };
  // Only members with a Fotolog name get the choice.
  const primary = form.get("primaryName")?.toString();
  try {
    // Only this page's settings are written; the others were filled in for validation.
    await updateMemberSettings(
      user.did,
      Object.fromEntries(SECTION_FIELDS[section].map((f) => [f, result.value[f]])),
    );
    if (primary === "fotolog" || primary === "bluesky") {
      const { name } = await memberName(user.did);
      if (name) await setShowFotologName(user.did, primary === "fotolog");
    }
  } catch (err) {
    log.error("Saving member settings failed", { did: user.did, err });
    return { status: "error", errors: {}, message: "Something went wrong saving. Please try again." };
  }
  revalidatePath("/settings", "layout");
  return { status: "saved" };
}

/** Puts the signed-in member's page title and colors back to the defaults. */
export async function resetSettings() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The page's look only: the location belongs to the Profile page.
  await updateMemberSettings(user.did, { title: null, backgroundColor: null, textColor: null, linkColor: null });
  revalidatePath("/settings", "layout");
  // A fresh value each time, so the page remounts the form with the defaults.
  redirect(`/settings/customize?reset=${Date.now()}`);
}

/** Whether a Fotolog name is free to take, for the live check as the member types. */
export async function checkFotologName(input: string): Promise<SetNameResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  return checkName(String(input).slice(0, 100), user.did);
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
    log.error("Setting Fotolog name failed", { did: user.did, err });
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

export type GroupSettingsResult = { ok: true } | { ok: false; message: string };

async function asGroupOwner(
  what: string,
  fn: (did: string) => Promise<void>,
): Promise<GroupSettingsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, message: "Please sign in again." };
  try {
    await fn(user.did);
  } catch (err) {
    log.error(`${what} failed`, { did: user.did, err });
    return { ok: false, message: "Something went wrong. Please try again." };
  }
  revalidatePath("/settings", "layout");
  return { ok: true };
}

/**
 * Makes the signed-in account a group with `joinPolicy`, changes its
 * policy, or with null makes it an ordinary account again.
 */
export async function setGroupAction(joinPolicy: string | null): Promise<GroupSettingsResult> {
  if (joinPolicy !== null && joinPolicy !== "open" && joinPolicy !== "approval") {
    return { ok: false, message: "Unknown setting." };
  }
  return asGroupOwner("Changing group settings", (did) => setGroup(did, joinPolicy));
}

/** Lets a waiting member into the signed-in group. */
export async function approveMemberAction(memberDid: string): Promise<GroupSettingsResult> {
  return asGroupOwner("Approving a group member", (did) =>
    approveRequest({ did, handle: null }, String(memberDid)),
  );
}

/** Removes a member from the signed-in group, or declines their request. */
export async function removeMemberAction(memberDid: string): Promise<GroupSettingsResult> {
  return asGroupOwner("Removing a group member", (did) => leaveGroup(did, String(memberDid)));
}
