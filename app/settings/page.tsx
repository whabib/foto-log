import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { memberName } from "@/lib/fotolog-name-server";
import { countryOptions } from "@/lib/geo";
import { getGroup } from "@/lib/groups-server";
import { getMemberSettings } from "@/lib/member-settings-server";
import { currentIdentity } from "@/lib/photos/server";
import { GroupToggle } from "./GroupSettings";
import ProfileForm from "./ProfileForm";

export const metadata: Metadata = { title: "Profile · Settings · foto-log" };

/** Settings' Profile page: the member's name, location, and whether the account is a group. */
export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [identity, fotologName, saved, group] = await Promise.all([
    currentIdentity(user),
    memberName(user.did),
    getMemberSettings(user.did),
    getGroup(user.did).catch(() => undefined),
  ]);

  return (
    <section className="settings-section" aria-labelledby="profile-heading">
      <h2 id="profile-heading">Profile</h2>
      <ProfileForm
        initial={{ country: saved?.country ?? "", region: saved?.region ?? "", locality: saved?.locality ?? "" }}
        countries={countryOptions()}
        identity={{
          name: fotologName.name,
          handle: identity.handle,
          primary: fotologName.primary ? "fotolog" : "bluesky",
        }}
      />
      {group !== undefined && <GroupToggle isGroup={group !== null} />}
    </section>
  );
}
