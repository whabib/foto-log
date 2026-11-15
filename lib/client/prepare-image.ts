/** Turning a chosen file into an upload-ready JPEG, in the browser. */

export type PreparedImage = { blob: Blob; width: number; height: number; url: string };

const TARGET_BYTES = 950_000;

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality),
  );
}

/**
 * Resizes to at most `maxEdge` px on the long edge and re-encodes as JPEG
 * under ~1 MB. Re-encoding through a canvas drops all metadata, including
 * EXIF and GPS location; the orientation is applied to the pixels first.
 * Transparent areas are filled with `background`.
 */
export async function prepareImage(
  file: File,
  { maxEdge = 2000, background = "#fff" }: { maxEdge?: number; background?: string } = {},
): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  let scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.9, 0.82, 0.75, 0.65]) {
        const blob = await toJpeg(canvas, quality);
        if (blob.size <= TARGET_BYTES) {
          return { blob, width, height, url: URL.createObjectURL(blob) };
        }
      }
      scale *= 0.8;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("too large");
}
