import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import AccountMenu from "@/app/components/AccountMenu";
import { memberPath } from "@/lib/photos/urls";

export default async function Header() {
  const user = await getCurrentUser();
  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="foto-log home">
        {/* The logo is an alpha mask filled with the text color, so it follows each member's colors. */}
        <span className="brand-logo" aria-hidden="true" />
      </Link>
      {user ? (
        <div className="account">
          <AccountMenu
            label={user.handle ? `@${user.handle}` : user.did}
            myPage={memberPath({ did: user.did, handle: user.handle ?? null })}
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
