import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { formatLocation } from "@/lib/geo";
import { resolveActor } from "@/lib/identity";
import { getMemberImages } from "@/lib/member-profile-server";
import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_TEXT_COLOR,
  defaultTitle,
  EMPTY_SETTINGS,
} from "@/lib/member-settings";
import { getMemberSettings } from "@/lib/member-settings-server";
import { currentIdentity } from "@/lib/photos/server";
import { memberImageUrl, memberPath } from "@/lib/photos/urls";
import PageForm from "../PageForm";

export const metadata: Metadata = { title: "Member Page Customization · Settings · foto-log" };

/** Settings' Member Page Customization page: how the member's fotolog looks. */
export default async function CustomizePage({ searchParams }: PageProps<"/settings/customize">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [identity, saved, { reset }, actor] = await Promise.all([
    currentIdentity(user),
    getMemberSettings(user.did),
    searchParams,
    resolveActor(user.did),
  ]);
  const images = actor ? await getMemberImages(actor, { fresh: true }) : null;
  const s = saved ?? EMPTY_SETTINGS;

  return (
    <section className="settings-section" aria-labelledby="page-heading">
      <h2 id="page-heading">Member Page Customization</h2>
      <p className="muted">How your fotolog looks to everyone who visits it.</p>
      {reset && <p className="notice-inline">Your page title and colors are back to the defaults.</p>}
      <PageForm
        // The form keeps its own state, so remount it after a reset.
        key={typeof reset === "string" ? reset : "customize"}
        initial={{
          title: s.title ?? "",
          backgroundColor: s.backgroundColor ?? "",
          textColor: s.textColor ?? "",
          linkColor: s.linkColor ?? "",
        }}
        defaults={{
          title: defaultTitle(identity),
          backgroundColor: DEFAULT_BACKGROUND_COLOR,
          textColor: DEFAULT_TEXT_COLOR,
        }}
        location={s.country ? formatLocation({ country: s.country, region: s.region, locality: s.locality }) : null}
        hasSaved={saved !== null}
        memberPage={memberPath(identity)}
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
    </section>
  );
}
