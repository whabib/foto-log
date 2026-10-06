import { NextResponse, type NextRequest } from "next/server";
import { createUserSession, lookupHandle, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { baseUrl } from "@/lib/config";
import {
  callbackErrorDetails,
  getOAuthClient,
  parseSignInState,
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
    const cookie = await createUserSession(session.did, handle);
    const response = redirectTo("/");
    response.cookies.set(SESSION_COOKIE, cookie, sessionCookieOptions);
    return response;
  } catch (err) {
    const details = callbackErrorDetails(err);
    if (details) {
      const { error } = details;
      const state = parseSignInState(details.state);
      // Servers without PAR report a scope problem here instead of up front.
      if (error === "invalid_scope" && state && !state.fallback) {
        const url = await startSignIn(state.input, true).catch(() => null);
        if (url) return NextResponse.redirect(url, 303);
      }
      if (error === "access_denied") return redirectTo("/login?error=denied");
    }
    console.error("OAuth callback failed", err);
    return redirectTo("/login?error=failed");
  }
}
