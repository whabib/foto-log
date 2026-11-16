import { isValidDid } from "@atproto/syntax";
import { getCurrentUser } from "@/lib/auth";
import { baseUrl } from "@/lib/config";
import { PhotoError, postPhoto } from "@/lib/photos/server";

export const dynamic = "force-dynamic";

const STATUS: Record<PhotoError["code"], number> = {
  invalid: 400,
  session_expired: 401,
  forbidden: 403,
  not_found: 404,
  already_posted: 409,
  day_full: 409,
  unavailable: 503,
};

/**
 * Posts today's photo for the signed-in user, or with a `group` field, to
 * that group. Body: multipart form from /post.
 */
export async function POST(request: Request) {
  // The session cookie is SameSite=Lax, but check the origin too.
  if (request.headers.get("origin") !== new URL(baseUrl).origin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Please sign in first.", code: "session_expired" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  const image = form.get("image");
  if (!(image instanceof Blob)) {
    return Response.json({ error: "Please choose a photo." }, { status: 400 });
  }

  const group = form.get("group");
  const groupDid = typeof group === "string" && group ? group : undefined;
  if (groupDid !== undefined && !isValidDid(groupDid)) {
    return Response.json({ error: "Unknown group." }, { status: 400 });
  }

  try {
    const path = await postPhoto(user, {
      image: new Uint8Array(await image.arrayBuffer()),
      mimeType: image.type,
      width: Number(form.get("width")),
      height: Number(form.get("height")),
      caption: String(form.get("caption") ?? ""),
      alt: String(form.get("alt") ?? ""),
      timeZone: String(form.get("timeZone") ?? ""),
    }, { groupDid });
    return Response.json({ path }, { status: 201 });
  } catch (err) {
    if (err instanceof PhotoError) {
      return Response.json(
        { error: err.message, code: err.code, path: err.path },
        { status: STATUS[err.code] },
      );
    }
    console.error("Posting a photo failed", { did: user.did, err });
    return Response.json(
      { error: "Something went wrong saving your photo. Please try again." },
      { status: 502 },
    );
  }
}
