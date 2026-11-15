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
import { memberImageUrl } from "@/lib/photos/urls";
import { currentIdentity } from "@/lib/photos/server";
import SettingsForm from "./SettingsForm";
import TitleImageForm from "./TitleImageForm";

export const metadata: Metadata = { title: "Settings · foto-log" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
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
    <main className="settings-page">
      <h1>Settings</h1>
      <section>
        <h2>Customize your member page</h2>
        <p className="muted">How your Fotolog looks to everyone who visits it.</p>
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
        />
      </section>
      <section>
        <h2>Title image</h2>
        {images ? (
          <TitleImageForm
            current={images.titleImage ? memberImageUrl(user.did, images.titleImage.cid) : null}
            title={s.title ?? defaultTitle(identity)}
            background={s.backgroundColor ?? DEFAULT_BACKGROUND_COLOR}
          />
        ) : (
          <p className="field-error">Your page images couldn&apos;t be loaded. Please try again later.</p>
        )}
      </section>
    </main>
  );
}
