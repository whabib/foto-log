import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Your foto-log was deleted · foto-log" };

/** Where a member lands after deleting their foto-log. */
export default async function GoodbyePage({ searchParams }: PageProps<"/goodbye">) {
  const { kept } = await searchParams;
  return (
    <main className="login welcome">
      <h1>Your foto-log was deleted</h1>
      {kept === "1" ? (
        <p>
          Your photos and friends are still in your Bluesky repository. If you sign in again, they&apos;ll be back on
          a new foto-log.
        </p>
      ) : (
        <p>Thanks for being part of foto-log. You&apos;re welcome back any time.</p>
      )}
      <Link href="/" className="welcome-continue">
        Go to foto-log
      </Link>
    </main>
  );
}
