import { getOAuthClient } from "@/lib/oauth/client";

export const dynamic = "force-dynamic";

/** OAuth client metadata; its URL is the client_id. */
export async function GET() {
  const client = await getOAuthClient();
  return Response.json(client.clientMetadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
