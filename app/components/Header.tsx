import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import AccountMenu from "@/app/components/AccountMenu";
import AccountWatcher from "@/app/components/AccountWatcher";
import UploadPrompt from "@/app/components/UploadPrompt";
import { isAdmin } from "@/lib/admin-server";
import { getGroup } from "@/lib/groups-server";
import { currentIdentity } from "@/lib/photos/server";
import { memberPath } from "@/lib/photos/urls";

export default async function Header() {
  const user = await getCurrentUser();
  // The session keeps the handle from sign-in; look up the current one so a
  // changed handle doesn't send My Page to someone else's page.
  const [identity, group, admin] = user
    ? await Promise.all([
        currentIdentity(user),
        getGroup(user.did).catch(() => null),
        isAdmin(user.did).catch(() => false),
      ])
    : [null, null, false];
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="foto-log home">
        {/* The logo is an alpha mask filled with the text color, so it follows each member's colors. */}
        <span className="brand-logo" aria-hidden="true" />
      </Link>
      {user && identity ? (
        <div className="account">
          <AccountWatcher did={user.did} />
          <UploadPrompt />
          <AccountMenu
            label={identity.name ?? (identity.handle ? `@${identity.handle}` : user.did)}
            myPage={memberPath(identity)}
            isGroup={group !== null}
            isAdmin={admin}
          />
        </div>
      ) : (
        <Link href="/login" className="account">
          Sign in or Sign up!
        </Link>
      )}
    </header>
  );
}
