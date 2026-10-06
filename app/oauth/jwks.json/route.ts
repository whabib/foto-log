import { getOAuthClient } from "@/lib/oauth/client";

export const dynamic = "force-dynamic";

/** Public half of the client's signing key, used by authorization servers. */
export async function GET() {
  const client = await getOAuthClient();
  return Response.json(client.jwks, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
