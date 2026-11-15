"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type PreparedImage, prepareImage } from "@/lib/client/prepare-image";

type Status = { kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string; signIn?: boolean };

/** Upload, preview and remove the member page's title image. */
export default function TitleImageForm({
  current,
  title,
  background,
}: {
  /** URL of the saved title image, if any. */
  current: string | null;
  /** The text title, used as alt text. */
  title: string;
  /** The page's background color, which fills any transparency. */
  background: string;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<PreparedImage | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

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

  async function send(image: PreparedImage | null) {
    setStatus({ kind: "busy" });
    const form = new FormData();
    form.set("field", "titleImage");
    if (image) {
      form.set("image", image.blob, "title.jpg");
      form.set("width", String(image.width));
      form.set("height", String(image.height));
    }
    try {
      const res = await fetch("/api/member-images", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        setStatus({
          kind: "error",
          message: data.error ?? "Something went wrong. Please try again.",
          signIn: data.code === "session_expired",
        });
        return;
      }
      setPicked(null);
      setStatus({ kind: "idle" });
      router.refresh();
    } catch {
      setStatus({ kind: "error", message: "Couldn't reach foto-log. Check your connection and try again." });
    }
  }

  const shown = picked?.url ?? current;
  const busy = status.kind === "busy";
  return (
    <div className="image-setting">
      <div className="title-image-preview" style={{ backgroundColor: background }}>
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={title} />
        ) : (
          <span className="muted">No title image. Your page shows the text title.</span>
        )}
      </div>
      <div className="image-setting-row">
        <label className="file-button">
          {current || picked ? "Choose another image" : "Choose an image"}
          <input type="file" accept="image/*" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {picked && (
          <button type="button" className="primary" disabled={busy} onClick={() => send(picked)}>
            {busy ? "Saving…" : "Save title image"}
          </button>
        )}
        {picked && (
          <button type="button" disabled={busy} onClick={() => setPicked(null)}>
            Cancel
          </button>
        )}
        {!picked && current && (
          <button type="button" disabled={busy} onClick={() => send(null)}>
            {busy ? "Removing…" : "Remove"}
          </button>
        )}
      </div>
      <p className="hint">
        Replaces the text title across the top of your page. Wide images work best, like 738×60. It&apos;s shown up
        to 150px tall and saved in your own Bluesky account.
      </p>
      {status.kind === "error" && (
        <p className="field-error" role="alert">
          {status.message} {status.signIn && <Link href="/login">Sign in</Link>}
        </p>
      )}
    </div>
  );
}
