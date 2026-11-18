import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NAME_HOLD_DAYS } from "@/lib/account-delete-server";
import { isBuiltInAdmin } from "@/lib/admin-server";
import { getCurrentUser } from "@/lib/auth";
import { getGroup, memberCount } from "@/lib/groups-server";
import { resolveActor } from "@/lib/identity";
import DeleteAccountForm from "./DeleteAccountForm";

export const metadata: Metadata = { title: "Delete Account · Settings · foto-log" };

/** Settings' Delete Account page: what a delete removes and keeps, and the form to do it. */
export default async function DeleteAccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [actor, group, builtIn] = await Promise.all([
    resolveActor(user.did).catch(() => null),
    getGroup(user.did).catch(() => null),
    isBuiltInAdmin(user.did),
  ]);
  const handle = actor?.handle ?? user.handle;
  const members = group ? await memberCount(user.did) : 0;

  return (
    <section className="settings-section delete-account" aria-labelledby="delete-heading">
      <h2 id="delete-heading">Delete Account</h2>
      {builtIn ? (
        <p>This account runs foto-log and can&apos;t be deleted.</p>
      ) : (
        <>
          <p>Deleting your foto-log removes it from foto-log right away:</p>
          <ul>
            <li>your pages, Fotolog name, page settings and location</li>
            {group && (
              <li>
                this group, and its {members === 1 ? "1 member" : `${members.toLocaleString("en-US")} members`}{" "}
                lose it
              </li>
            )}
            <li>your group memberships</li>
            <li>you&apos;re signed out of foto-log everywhere</li>
          </ul>
          <p>
            Metadata about your photos, your Friends/Favorites list, and images related to your page customization
            (like your Title Image and Wallpaper) are kept in your Bluesky repository. If you check the box below,
            we will remove that data as well. Removing this information will not change your Bluesky account. If you
            uncheck the box, then we will leave that information there and if you come back to foto-log, we will 
            be able to recreate your account with your photo history intact.
          </p>
          <p className="muted">
            Your Bluesky account isn&apos;t touched, nor anything posted to Bluesky: the posts shared with your
            photos and guestbook entries stay there. Photos you posted to groups stay with the groups. Your
            Fotolog name is held for you for {NAME_HOLD_DAYS} days, in case you come back.
          </p>
          <DeleteAccountForm handle={handle} did={user.did} />
        </>
      )}
    </section>
  );
}
