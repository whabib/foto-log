import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import ContinueSoon from "./ContinueSoon";

export const metadata: Metadata = { title: "Welcome · foto-log" };

/** Where a new member lands after their first sign-in, on the way to Settings. */
export default async function WelcomePage() {
  if (!(await getCurrentUser())) redirect("/login");
  return (
    <main className="login welcome">
      <h1>Welcome to foto-log</h1>
      <p>We are going to take you to a page where you can customize your Foto-log a bit.</p>
      <Link href="/settings" className="welcome-continue">
        Continue
      </Link>
      <ContinueSoon href="/settings" />
    </main>
  );
}
