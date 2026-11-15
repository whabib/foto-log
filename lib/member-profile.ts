import * as Profile from "@/lib/lexicon/types/com/foto-log/profile";
import { MAX_IMAGE_BYTES } from "@/lib/photo-record";

export const PROFILE_COLLECTION = "com.foto-log.profile";
export const PROFILE_RKEY = "self";

export type ProfileRecord = Profile.Record;
export type ProfileImageField = "titleImage" | "wallpaper" | "avatar";
export const PROFILE_IMAGE_FIELDS: readonly ProfileImageField[] = ["titleImage", "wallpaper", "avatar"];

/** An image from the member's profile record, ready to show. */
export type MemberImage = { cid: string; width: number | null; height: number | null };

/** The member page images from a member's profile record. */
export type MemberImages = {
  titleImage: MemberImage | null;
  wallpaper: MemberImage | null;
  wallpaperMode: "tile" | "fill";
  avatar: MemberImage | null;
};

export const NO_MEMBER_IMAGES: MemberImages = {
  titleImage: null,
  wallpaper: null,
  wallpaperMode: "tile",
  avatar: null,
};

function toImage(image: Profile.Image | undefined): MemberImage | null {
  if (!image) return null;
  const blob = image.image;
  // The lexicon validator doesn't check blob types and sizes.
  if (!blob.mimeType.startsWith("image/") || blob.size > MAX_IMAGE_BYTES) return null;
  return {
    cid: blob.ref.toString(),
    width: image.aspectRatio?.width ?? null,
    height: image.aspectRatio?.height ?? null,
  };
}

/**
 * Reads a com.foto-log.profile record (already converted with jsonToLex)
 * into the images to show. Anything invalid is treated as unset.
 */
export function memberImagesFromRecord(record: unknown): MemberImages {
  const result = Profile.validateRecord(record);
  if (!result.success) return NO_MEMBER_IMAGES;
  const r = result.value;
  return {
    titleImage: toImage(r.titleImage),
    wallpaper: toImage(r.wallpaper),
    wallpaperMode: r.wallpaperMode === "fill" ? "fill" : "tile",
    avatar: toImage(r.avatar),
  };
}
