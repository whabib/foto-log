import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import AccountMenu from "@/app/components/AccountMenu";
import AccountWatcher from "@/app/components/AccountWatcher";
import { getGroup } from "@/lib/groups-server";
import { currentIdentity } from "@/lib/photos/server";
import { memberPath } from "@/lib/photos/urls";

export default async function Header() {
  const user = await getCurrentUser();
  // The session keeps the handle from sign-in; look up the current one so a
  // changed handle doesn't send My Page to someone else's page.
  const [identity, group] = user
    ? await Promise.all([currentIdentity(user), getGroup(user.did).catch(() => null)])
    : [null, null];
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="foto-log home">
        {/* The logo is an alpha mask filled with the text color, so it follows each member's colors. */}
        <span className="brand-logo" aria-hidden="true" />
      </Link>
      {user && identity ? (
        <div className="account">
          <AccountWatcher did={user.did} />
          <AccountMenu
            label={identity.name ?? (identity.handle ? `@${identity.handle}` : user.did)}
            myPage={memberPath(identity)}
            isGroup={group !== null}
          />
        </div>
      ) : (
        <Link href="/login" className="account">
          Sign in
        </Link>
      )}
    </header>
  );
}
