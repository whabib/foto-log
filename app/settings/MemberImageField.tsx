"use client";

import { type ReactNode, startTransition, useEffect, useState } from "react";
import { reauthorize } from "@/app/login/actions";
import { type PreparedImage, prepareImage } from "@/lib/client/prepare-image";
import type { ProfileImageField } from "@/lib/member-profile";

/** A change to one image, waiting for the settings form's Save. */
export type PendingImage = { kind: "none" } | { kind: "set"; image: PreparedImage } | { kind: "remove" };
export const NO_CHANGE: PendingImage = { kind: "none" };

export type ImageError = { message: string; signIn?: boolean };

/**
 * Saves changes to the member's page images. Resolves to an error, or null
 * when it worked.
 */
export async function saveImageChange(
  field: ProfileImageField,
  change: PendingImage,
  wallpaperMode?: "tile" | "fill",
): Promise<ImageError | null> {
  const form = new FormData();
  if (change.kind !== "none") form.set("field", field);
  if (change.kind === "set") {
    form.set("image", change.image.blob, `${field}.jpg`);
    form.set("width", String(change.image.width));
    form.set("height", String(change.image.height));
  }
  if (change.kind === "remove") form.set("remove", "1");
  if (wallpaperMode) form.set("wallpaperMode", wallpaperMode);
  try {
    const res = await fetch("/api/member-images", { method: "POST", body: form });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    return {
      message: data.error ?? "Something went wrong saving that image. Please try again.",
      signIn: data.code === "session_expired",
    };
  } catch {
    return { message: "Couldn't reach foto-log. Check your connection and try again." };
  }
}

/** The "Sign in again" control for permission errors. A button, since it sits inside the settings form. */
export function ImageErrorMessage({ error }: { error: ImageError }) {
  return (
    <div className="field-error" role="alert">
      {error.message}{" "}
      {error.signIn && (
        <button type="button" className="link-button" onClick={() => startTransition(() => reauthorize())}>
          Sign in again
        </button>
      )}
    </div>
  );
}

/**
 * Choose, preview and remove one member page image. The change waits in
 * `pending` until the settings form is saved.
 */
export default function MemberImageField({
  field,
  label,
  current,
  pending,
  onChange,
  disabled,
  error,
  alt,
  background,
  hint,
  previewClassName,
  controls,
  renderPreview,
}: {
  field: ProfileImageField;
  label: string;
  /** URL of the saved image, if any. */
  current: string | null;
  pending: PendingImage;
  onChange: (change: PendingImage) => void;
  disabled?: boolean;
  error?: ImageError | null;
  alt: string;
  /** Fills any transparency in the chosen image, and the preview. */
  background: string;
  hint: ReactNode;
  previewClassName: string;
  /** More options under the buttons. */
  controls?: ReactNode;
  /** Draws the preview from the image URL; an <img> by default. */
  renderPreview?: (url: string) => ReactNode;
}) {
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const id = `${field}-label`;
  const picked = pending.kind === "set" ? pending.image : null;

  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      onChange({ kind: "set", image: await prepareImage(file, { background }) });
    } catch {
      setReadError("That image couldn't be read. Try a JPEG or PNG.");
    } finally {
      setReading(false);
    }
  }

  const shown = picked ? picked.url : pending.kind === "remove" ? null : current;
  const busy = disabled || reading;
  return (
    <div className="field image-setting">
      <span className="label" id={id}>
        {label} <span className="optional">(optional)</span>
      </span>
      <div className={`image-preview ${previewClassName}`} style={{ backgroundColor: background }}>
        {shown && renderPreview ? (
          renderPreview(shown)
        ) : shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={alt} />
        ) : (
          <span className="muted">{pending.kind === "remove" ? "Removed when you save" : "None"}</span>
        )}
      </div>
      <div className="image-setting-row">
        <label className="file-button">
          {reading ? "Reading…" : shown ? "Choose another image" : "Choose an image"}
          <input
            type="file"
            accept="image/*"
            aria-labelledby={id}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Clear it, so choosing the same file again still fires.
              e.target.value = "";
              onFile(file);
            }}
          />
        </label>
        {pending.kind !== "none" ? (
          <button type="button" disabled={busy} onClick={() => onChange(NO_CHANGE)}>
            Undo
          </button>
        ) : (
          current && (
            <button type="button" disabled={busy} onClick={() => onChange({ kind: "remove" })}>
              Remove
            </button>
          )
        )}
      </div>
      {controls}
      <p className="hint">{hint}</p>
      {readError && <p className="field-error">{readError}</p>}
      {error && <ImageErrorMessage error={error} />}
    </div>
  );
}
