import { NextResponse, type NextRequest } from "next/server";
import { lookupHandle, signInOnBrowser } from "@/lib/auth";
import { baseUrl } from "@/lib/config";
import { primaryName } from "@/lib/fotolog-name-server";
import { welcomeNewMember } from "@/lib/friends-server";
import { backfillOnSignIn, rememberHandle } from "@/lib/photo-index-server";
import { memberPath } from "@/lib/photos/urls";
import {
  callbackErrorDetails,
  getOAuthClient,
  parseSignInState,
  LAST_TIER,
  startSignIn,
} from "@/lib/oauth/client";

export const dynamic = "force-dynamic";

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, baseUrl), 303);
}

/** Where the user's authorization server sends them back after sign-in. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const client = await getOAuthClient();
  try {
    const { session } = await client.callback(params);
    const handle = await lookupHandle(session);
    const signedIn = await signInOnBrowser(session.did, handle);
    if (!signedIn.ok) return redirectTo(signedIn.reason === "full" ? "/accounts?error=full" : "/login?error=failed");
    await welcomeNewMember({ did: session.did, handle });
    await rememberHandle(session.did, handle).catch((err) => console.warn("Couldn't record handle", { err }));
    await backfillOnSignIn(session.did);
    // Members land on their own fotolog.
    const name = await primaryName(session.did).catch(() => null);
    return redirectTo(memberPath({ did: session.did, handle, name }));
  } catch (err) {
    const details = callbackErrorDetails(err);
    if (details) {
      const { error } = details;
      const state = parseSignInState(details.state);
      // Servers without PAR report a scope problem here instead of up front.
      if (error === "invalid_scope" && state && state.tier < LAST_TIER) {
        const url = await startSignIn(state.input, state.tier + 1, { selectAccount: state.selectAccount }).catch(() => null);
        if (url) return NextResponse.redirect(url, 303);
      }
      if (error === "access_denied") return redirectTo("/login?error=denied");
    }
    console.error("OAuth callback failed", err);
    return redirectTo("/login?error=failed");
  }
}
