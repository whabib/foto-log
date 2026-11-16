import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { countryOptions } from "@/lib/geo";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_TEXT_COLOR,
  defaultTitle,
  EMPTY_SETTINGS,
} from "@/lib/member-settings";
import { getMemberImages } from "@/lib/member-profile-server";
import { getMemberSettings } from "@/lib/member-settings-server";
import { resolveActor } from "@/lib/identity";
import { memberImageUrl, memberPath } from "@/lib/photos/urls";
import { memberName } from "@/lib/fotolog-name-server";
import { currentIdentity } from "@/lib/photos/server";
import { getGroup, groupMembers } from "@/lib/groups-server";
import SettingsForm from "./SettingsForm";

export const metadata: Metadata = { title: "Settings · foto-log" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [identity, fotologName, saved, { reset }, actor] = await Promise.all([
    currentIdentity(user),
    memberName(user.did),
    getMemberSettings(user.did),
    searchParams,
    resolveActor(user.did),
  ]);
  const [images, group] = await Promise.all([
    actor ? getMemberImages(actor, { fresh: true }) : null,
    loadGroup(user.did),
  ]);
  const s = saved ?? EMPTY_SETTINGS;

  return (
    <main className="settings-page">
      <h1>Settings</h1>
      <div>
        {reset && <p className="notice-inline">Your member page is back to the defaults.</p>}
        <SettingsForm
          // The form keeps its own state, so remount it after a reset.
          key={typeof reset === "string" ? reset : "settings"}
          initial={{
            title: s.title ?? "",
            country: s.country ?? "",
            region: s.region ?? "",
            locality: s.locality ?? "",
            backgroundColor: s.backgroundColor ?? "",
            textColor: s.textColor ?? "",
            linkColor: s.linkColor ?? "",
          }}
          defaults={{
            title: defaultTitle(identity),
            backgroundColor: DEFAULT_BACKGROUND_COLOR,
            textColor: DEFAULT_TEXT_COLOR,
          }}
          countries={countryOptions()}
          hasSaved={saved !== null}
          memberPage={memberPath(identity)}
          group={group ?? undefined}
          identity={{
            name: fotologName.name,
            handle: identity.handle,
            primary: fotologName.primary ? "fotolog" : "bluesky",
          }}
          images={
            images
              ? {
                  titleImage: images.titleImage ? memberImageUrl(user.did, images.titleImage.cid) : null,
                  wallpaper: images.wallpaper ? memberImageUrl(user.did, images.wallpaper.cid) : null,
                  wallpaperMode: images.wallpaperMode,
                }
              : undefined
          }
        />
      </div>
    </main>
  );
}

/** The account's group settings and members, or null if they couldn't be loaded. */
async function loadGroup(did: string) {
  try {
    const group = await getGroup(did);
    const members = group ? await groupMembers(did) : [];
    return {
      joinPolicy: group?.joinPolicy ?? null,
      members: members.map((m) => ({ did: m.did, handle: m.handle, name: m.name, status: m.status })),
    };
  } catch (err) {
    console.warn("Couldn't load group settings", { did, err });
    return null;
  }
}
