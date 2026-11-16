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
  day_full: 409,
  unavailable: 503,
};

function isField(v: unknown): v is ProfileImageField {
  return typeof v === "string" && (PROFILE_IMAGE_FIELDS as readonly string[]).includes(v);
}

/**
 * Changes the signed-in member's page images. Multipart body:
 * - `field`, `image`, `width`, `height` sets an image;
 * - `field` and `remove=1` clears it;
 * - `wallpaperMode` (`tile` or `fill`) sets the wallpaper mode, alone or with either.
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
  const image = form.get("image");
  const remove = form.get("remove") === "1";
  const mode = form.get("wallpaperMode");
  const wallpaperMode = mode === "tile" || mode === "fill" ? mode : undefined;
  if (field !== null && !isField(field)) return Response.json({ error: "Unknown image." }, { status: 400 });
  if (image !== null && !(image instanceof Blob)) {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  if (mode !== null && !wallpaperMode) return Response.json({ error: "Unknown wallpaper mode." }, { status: 400 });
  // Exactly one of: an image to set, a removal, or only a mode change.
  const hasImage = image instanceof Blob;
  if (field ? hasImage === remove : hasImage || remove || !wallpaperMode) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    await setMemberImage(
      user,
      field
        ? {
            field,
            upload:
              image instanceof Blob
                ? {
                    bytes: new Uint8Array(await image.arrayBuffer()),
                    mimeType: image.type,
                    width: Number(form.get("width")),
                    height: Number(form.get("height")),
                  }
                : null,
          }
        : null,
      { wallpaperMode },
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
