import { browserAccounts, signOutOfBrowser } from "@/lib/auth";
import { isSameOrigin, seeOther } from "@/lib/same-origin";

/**
 * Signs one account out of this browser, from the Switch accounts page.
 * If it was the current one, the most recently used other account takes
 * over. Stays on the page while any account is still signed in.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const did = String((await request.formData()).get("did") ?? "");
  if (!did) return seeOther("/accounts");
  const before = await browserAccounts();
  await signOutOfBrowser(did);
  const remaining = before.filter((a) => a.did !== did).length;
  return seeOther(remaining > 0 ? "/accounts" : "/");
}
