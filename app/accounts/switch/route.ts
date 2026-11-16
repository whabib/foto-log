import { switchAccount } from "@/lib/auth";
import { primaryName } from "@/lib/fotolog-name-server";
import { resolveActor } from "@/lib/identity";
import { memberPath } from "@/lib/photos/urls";
import { isSameOrigin, seeOther } from "@/lib/same-origin";

/** Switches to another account signed in on this browser and opens its page. A plain POST, like /logout. */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Forbidden", { status: 403 });
  const did = String((await request.formData()).get("did") ?? "");
  const account = did ? await switchAccount(did) : null;
  if (!account) return seeOther("/accounts?error=gone");
  // The handle saved at sign-in may be out of date; use the verified one, or the DID.
  const [name, actor] = await Promise.all([
    primaryName(account.did).catch(() => null),
    resolveActor(account.did).catch(() => null),
  ]);
  return seeOther(memberPath({ did: account.did, handle: actor?.handle ?? null, name }));
}
