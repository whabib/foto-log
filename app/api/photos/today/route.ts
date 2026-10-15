import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { PhotoError, todaysPhotoPath } from "@/lib/photos/server";

export const dynamic = "force-dynamic";

/** Whether the signed-in user already posted today (in ?tz=). Returns { path } or { path: null }. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const path = await todaysPhotoPath(user, request.nextUrl.searchParams.get("tz") ?? "");
    return Response.json({ path }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof PhotoError) return Response.json({ error: err.message }, { status: 400 });
    console.error("Checking today's photo failed", { did: user.did, err });
    return Response.json({ path: null });
  }
}
