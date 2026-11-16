import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { browserAccounts, MAX_ACCOUNTS } from "@/lib/auth";
import { blueskyAvatar } from "@/lib/bsky-profile";
import { primaryNames } from "@/lib/fotolog-name-server";
import AccountActions from "./AccountActions";

export const metadata: Metadata = { title: "Switch accounts · foto-log" };

const ERRORS: Record<string, string> = {
  full: `You can be signed in to up to ${MAX_ACCOUNTS} accounts at once. Log out of one to add another.`,
  gone: "That account isn't signed in on this browser any more.",
};

/** The accounts signed in on this browser: switch between them, log out of one, or add another. */
export default async function AccountsPage({ searchParams }: PageProps<"/accounts">) {
  const accounts = await browserAccounts();
  if (accounts.length === 0) redirect("/login");
  const { error } = await searchParams;
  const message = typeof error === "string" ? (ERRORS[error] ?? null) : null;
  const [names, avatars] = await Promise.all([
    primaryNames(accounts.map((a) => a.did)).catch(() => new Map<string, string>()),
    Promise.all(accounts.map((a) => blueskyAvatar(a.did).catch(() => null))),
  ]);

  return (
    <main className="accounts-page">
      <h1>Switch accounts</h1>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <ul className="accounts-list">
        {accounts.map((a, i) => {
          const name = names.get(a.did);
          const handle = a.handle ? `@${a.handle}` : a.did;
          return (
            <li key={a.sessionId} className={a.current ? "account-row current" : "account-row"}>
              {/* The whole row switches; the current account has nothing to switch to. */}
              <form method="post" action="/accounts/switch" className="account-switch">
                <input type="hidden" name="did" value={a.did} />
                <button type="submit" disabled={a.current} aria-label={a.current ? undefined : `Switch to ${name ?? handle}`}>
                  {avatars[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="account-avatar" src={avatars[i]!} alt="" width={40} height={40} />
                  ) : (
                    <span className="account-avatar avatar-empty" aria-hidden="true" />
                  )}
                  <span className="account-names">
                    <strong>{name ?? handle}</strong>
                    {name && <span className="muted">{handle}</span>}
                  </span>
                  {a.current && <span className="account-current">Current</span>}
                </button>
              </form>
              <AccountActions did={a.did} label={name ?? handle} />
            </li>
          );
        })}
      </ul>
      {accounts.length < MAX_ACCOUNTS ? (
        <p>
          <Link href="/login?add=1">Log into another account&hellip;</Link>
        </p>
      ) : (
        <p className="muted">
          You&rsquo;re signed in to {MAX_ACCOUNTS} accounts, the most at once. Log out of one to add another.
        </p>
      )}
    </main>
  );
}
