"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, startTransition, useEffect, useState } from "react";
import { reauthorize } from "@/app/login/actions";
import { type PreparedImage, prepareImage } from "@/lib/client/prepare-image";
import type { ProfileImageField } from "@/lib/member-profile";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string; signIn?: boolean };

export type ImageRequest = { image?: PreparedImage; remove?: boolean; wallpaperMode?: "tile" | "fill" };

/**
 * Sends a change to the member's page images. Returns an error message, or
 * null when it worked.
 */
export function useImageSender(field: ProfileImageField) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  async function send(req: ImageRequest): Promise<boolean> {
    setStatus({ kind: "busy" });
    const form = new FormData();
    if (req.image || req.remove) form.set("field", field);
    if (req.image) {
      form.set("image", req.image.blob, `${field}.jpg`);
      form.set("width", String(req.image.width));
      form.set("height", String(req.image.height));
    }
    if (req.remove) form.set("remove", "1");
    if (req.wallpaperMode) form.set("wallpaperMode", req.wallpaperMode);
    try {
      const res = await fetch("/api/member-images", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setStatus({
          kind: "error",
          message: data.error ?? "Something went wrong. Please try again.",
          signIn: data.code === "session_expired",
        });
        return false;
      }
      setStatus({ kind: "idle" });
      router.refresh();
      return true;
    } catch {
      setStatus({ kind: "error", message: "Couldn't reach foto-log. Check your connection and try again." });
      return false;
    }
  }
  return { status, setStatus, send };
}

/**
 * Upload, preview and remove one member page image. Changes save right
 * away, separately from the rest of the settings form it sits in.
 */
export default function MemberImageField({
  field,
  label,
  current,
  alt,
  background,
  hint,
  previewClassName,
  extra,
  renderPreview,
}: {
  field: ProfileImageField;
  label: string;
  /** URL of the saved image, if any. */
  current: string | null;
  alt: string;
  /** Fills any transparency in the uploaded image, and the preview. */
  background: string;
  hint: ReactNode;
  previewClassName: string;
  /** More options, given the extra fields to send with an upload. */
  extra?: { request: Omit<ImageRequest, "image" | "remove">; controls: ReactNode };
  /** Draws the preview from the image URL; an <img> by default. */
  renderPreview?: (url: string) => ReactNode;
}) {
  const [picked, setPicked] = useState<PreparedImage | null>(null);
  const { status, setStatus, send } = useImageSender(field);
  const id = `${field}-label`;

  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  async function onFile(file: File | undefined) {
    setPicked(null);
    if (!file) return;
    setStatus({ kind: "busy" });
    try {
      setPicked(await prepareImage(file, { background }));
      setStatus({ kind: "idle" });
    } catch {
      setStatus({ kind: "error", message: "That image couldn't be read. Try a JPEG or PNG." });
    }
  }

  const shown = picked?.url ?? current;
  const busy = status.kind === "busy";
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
          <span className="muted">None</span>
        )}
      </div>
      <div className="image-setting-row">
        <label className="file-button">
          {current || picked ? "Choose another image" : "Choose an image"}
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
        {picked && (
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={async () => {
              if (await send({ image: picked, ...extra?.request })) setPicked(null);
            }}
          >
            {busy ? "Saving…" : `Save ${label.toLowerCase()}`}
          </button>
        )}
        {picked && (
          <button type="button" disabled={busy} onClick={() => setPicked(null)}>
            Cancel
          </button>
        )}
        {!picked && current && (
          <button type="button" disabled={busy} onClick={() => send({ remove: true })}>
            {busy ? "Removing…" : "Remove"}
          </button>
        )}
      </div>
      {extra?.controls}
      <p className="hint">{hint}</p>
      {status.kind === "error" && (
        <div className="field-error" role="alert">
          {status.message}{" "}
          {status.signIn && (
            // A button, not a form: this sits inside the settings form.
            <button type="button" className="link-button" onClick={() => startTransition(() => reauthorize())}>
              Sign in again
            </button>
          )}
        </div>
      )}
    </div>
  );
}
