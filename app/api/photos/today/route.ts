import { isValidDid } from "@atproto/syntax";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PhotoError, todaysPhotoPath } from "@/lib/photos/server";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/**
 * Whether the signed-in user already posted today (in ?tz=), or to the
 * group in ?group=. Returns { path } or { path: null }.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const params = request.nextUrl.searchParams;
    const group = params.get("group");
    if (group && !isValidDid(group)) return Response.json({ error: "Unknown group." }, { status: 400 });
    const path = await todaysPhotoPath(user, params.get("tz") ?? "", group ?? undefined);
    return Response.json({ path }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof PhotoError) {
      return Response.json({ error: err.message, code: err.code }, { status: err.code === "invalid" ? 400 : 403 });
    }
    log.error("Checking today's photo failed", { did: user.did, err });
    return Response.json({ path: null });
  }
}
