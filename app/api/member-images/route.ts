import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { baseUrl } from "@/lib/config";
import { PROFILE_IMAGE_FIELDS, type ProfileImageField } from "@/lib/member-profile";
import { setMemberImage } from "@/lib/member-profile-server";
import { PhotoError } from "@/lib/photos/server";

export const dynamic = "force-dynamic";

const STATUS: Record<PhotoError["code"], number> = {
  invalid: 400,
  session_expired: 401,
  forbidden: 403,
  not_found: 404,
  already_posted: 409,
};

function isField(v: unknown): v is ProfileImageField {
  return typeof v === "string" && (PROFILE_IMAGE_FIELDS as readonly string[]).includes(v);
}

/**
 * Sets (multipart body with `field`, `image`, `width`, `height`) or clears
 * (`field` and no `image`) one of the signed-in member's page images.
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
  const field = form.get("field");
  if (!isField(field)) return Response.json({ error: "Unknown image." }, { status: 400 });
  const image = form.get("image");
  // No image part means "remove"; anything else that isn't a file is a bad upload.
  if (image !== null && !(image instanceof Blob)) {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  const mode = form.get("wallpaperMode");

  try {
    await setMemberImage(
      user,
      field,
      image instanceof Blob
        ? {
            bytes: new Uint8Array(await image.arrayBuffer()),
            mimeType: image.type,
            width: Number(form.get("width")),
            height: Number(form.get("height")),
          }
        : null,
      mode === "tile" || mode === "fill" ? { wallpaperMode: mode } : {},
    );
  } catch (err) {
    if (err instanceof PhotoError) {
      return Response.json({ error: err.message, code: err.code }, { status: STATUS[err.code] });
    }
    console.error("Saving a member image failed", { did: user.did, field, err });
    return Response.json({ error: "Something went wrong saving that. Please try again." }, { status: 502 });
  }
  revalidatePath("/settings");
  return Response.json({ ok: true });
}
