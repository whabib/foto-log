import { BlobRef } from "@atproto/lexicon";
import { CID } from "multiformats/cid";
import { describe, expect, it } from "vitest";
import { memberImagesFromRecord, NO_MEMBER_IMAGES } from "./member-profile";

const cid = CID.parse("bafkreihhpmgmahaxz6qgrpjexfzshwbtx4zwr7ahxiulxd6h5gmz2uf7jy");
const blob = (mimeType = "image/jpeg", size = 50_000) => new BlobRef(cid, mimeType, size);
const record = (fields: Record<string, unknown>) => ({
  $type: "com.foto-log.profile",
  updatedAt: "2026-11-15T12:00:00.000Z",
  ...fields,
});

describe("memberImagesFromRecord", () => {
  it("reads each image with its size", () => {
    const images = memberImagesFromRecord(
      record({
        titleImage: { image: blob(), aspectRatio: { width: 738, height: 60 } },
        wallpaper: { image: blob() },
        wallpaperMode: "fill",
      }),
    );
    expect(images.titleImage).toEqual({ cid: cid.toString(), width: 738, height: 60 });
    expect(images.wallpaper).toEqual({ cid: cid.toString(), width: null, height: null });
    expect(images.wallpaperMode).toBe("fill");
    expect(images.avatar).toBeNull();
  });

  it("defaults the wallpaper to tiling", () => {
    expect(memberImagesFromRecord(record({ wallpaperMode: "sideways" })).wallpaperMode).toBe("tile");
  });

  it("ignores blobs that aren't images or are too big", () => {
    const images = memberImagesFromRecord(
      record({ titleImage: { image: blob("video/mp4") }, avatar: { image: blob("image/png", 2_000_000) } }),
    );
    expect(images.titleImage).toBeNull();
    expect(images.avatar).toBeNull();
  });

  it("treats an invalid record as no images", () => {
    expect(memberImagesFromRecord({ $type: "com.foto-log.profile" })).toEqual(NO_MEMBER_IMAGES);
    expect(memberImagesFromRecord(null)).toEqual(NO_MEMBER_IMAGES);
  });
});
