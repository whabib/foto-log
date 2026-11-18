import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Your Fotolog was deleted · Fotolog" };

/** Where a member lands after deleting their foto-log. */
export default async function GoodbyePage({ searchParams }: PageProps<"/goodbye">) {
  const { kept } = await searchParams;
  return (
    <main className="login welcome">
      <h1>Your Fotolog was deleted</h1>
      {kept === "1" ? (
        <p>
          Your photos and friends are still in your Bluesky repository. If you sign in again, they&apos;ll be back on
          a new Fotolog.
        </p>
      ) : (
        <p>Thanks for being part of Fotolog. You&apos;re welcome back any time.</p>
      )}
      <Link href="/" className="welcome-continue">
        Go to Fotolog
      </Link>
    </main>
  );
}
