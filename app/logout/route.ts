import { endUserSession } from "@/lib/auth";

/**
 * Signs out and goes to the home page. A plain form POST to a fixed URL,
 * not a Server Action, so a page left open across a deploy can still sign
 * out: Server Action IDs change with every build.
 */
export async function POST() {
  await endUserSession();
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
