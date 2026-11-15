import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import AccountMenu from "@/app/components/AccountMenu";
import { currentIdentity } from "@/lib/photos/server";
import { memberPath } from "@/lib/photos/urls";

export default async function Header() {
  const user = await getCurrentUser();
  // The session keeps the handle from sign-in; look up the current one so a
  // changed handle doesn't send My Page to someone else's page.
  const identity = user ? await currentIdentity(user) : null;
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="foto-log home">
        {/* The logo is an alpha mask filled with the text color, so it follows each member's colors. */}
        <span className="brand-logo" aria-hidden="true" />
      </Link>
      {user && identity ? (
        <div className="account">
          <AccountMenu
            label={identity.handle ? `@${identity.handle}` : user.did}
            myPage={memberPath(identity)}
            signOut={signOut}
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
