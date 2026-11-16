import { endUserSession } from "@/lib/auth";
import { baseUrl } from "@/lib/config";

/**
 * Signs out and goes to the home page. A plain form POST to a fixed URL,
 * not a Server Action, so a page left open across a deploy can still sign
 * out: Server Action IDs change with every build.
 */
export async function POST(request: Request) {
  // SameSite=Lax still lets other origins on the same site post here.
  if (request.headers.get("origin") !== new URL(baseUrl).origin) {
    return new Response("Forbidden", { status: 403 });
  }
  await endUserSession();
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
