import { signOutOfBrowser } from "@/lib/auth";
import { isSameOrigin, seeOther } from "@/lib/same-origin";

/**
 * Signs the current account out and goes to the home page, signed in to
 * the most recently used of this browser's other accounts, if any. A plain
 * form POST to a fixed URL, not a Server Action, so a page left open across
 * a deploy can still sign out: Server Action IDs change with every build.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  await signOutOfBrowser();
  return seeOther("/");
}
