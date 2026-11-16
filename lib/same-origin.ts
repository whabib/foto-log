import "server-only";
import { baseUrl } from "@/lib/config";

/**
 * Whether a form POST came from foto-log itself. SameSite=Lax cookies are
 * still sent on POSTs from other origins on the same site, so routes that
 * change who is signed in check this.
 */
export function isSameOrigin(request: Request): boolean {
  return request.headers.get("origin") === new URL(baseUrl).origin;
}

/** A 303 to a path on this site, so the browser follows a POST with a GET. */
export function seeOther(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}
