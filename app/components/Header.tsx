import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export default async function Header() {
  const user = await getCurrentUser();
  return (
    <header className="site-header">
      <Link href="/" className="brand">
        foto-log
      </Link>
      {user ? (
        <form action={signOut} className="account">
          <Link href="/post">Post a photo</Link>
          <Link href="/settings">Settings</Link>
          <span className="signed-in">
            <span className="signed-in-label">Signed in as </span>
            <strong>{user.handle ? `@${user.handle}` : user.did}</strong>
          </span>
          <button type="submit" className="link-button">
            Sign out
          </button>
        </form>
      ) : (
        <Link href="/login" className="account">
          Sign in
        </Link>
      )}
    </header>
  );
}
