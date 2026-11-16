import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, hasRoomForAccount } from "@/lib/auth";
import { signIn } from "./actions";

export const metadata: Metadata = { title: "Sign in · foto-log" };

const ERRORS: Record<string, string> = {
  invalid_handle: "That doesn't look like a handle. Try something like yourname.bsky.social.",
  resolve_failed: "We couldn't find that account. Check the handle and try again.",
  denied: "Sign-in was cancelled.",
  failed: "Something went wrong signing you in. Please try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, add } = await searchParams;
  // Signed-in members come here only to add another account (or after that failed).
  const adding = (await getCurrentUser()) !== null;
  if (adding && add === undefined && error === undefined) redirect("/");
  if (adding && !(await hasRoomForAccount())) redirect("/accounts?error=full");
  const message = typeof error === "string" ? (ERRORS[error] ?? ERRORS.failed) : null;

  return (
    <main className="login">
      <h1>{adding ? "Log into another account" : "Sign in to foto-log"}</h1>
      {adding && (
        <p className="muted">
          You&rsquo;ll stay signed in to your other accounts. Switch between them from your account menu.
        </p>
      )}
      <p className="muted">
        Use your Bluesky account, or any account on the AT Protocol. Your photos are stored in
        your own account, not on foto-log.
      </p>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <form action={signIn} className="login-form">
        <label htmlFor="handle">Your handle</label>
        <input
          id="handle"
          name="handle"
          type="text"
          placeholder="yourname.bsky.social"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <p className="hint">
          Leave this blank if your account is on Bluesky. Enter your handle if it&apos;s hosted
          somewhere else.
        </p>
        <button type="submit">Sign in with Bluesky</button>
      </form>
    </main>
  );
}
