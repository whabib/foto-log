"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { type PreparedImage, prepareImage } from "@/lib/client/prepare-image";

const MAX_ALT = 1000;

type Prepared = PreparedImage;

const segmenter = typeof Intl !== "undefined" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
function graphemes(text: string): number {
  return segmenter ? Array.from(segmenter.segment(text)).length : [...text].length;
}

type Status =
  | { kind: "checking" }
  | { kind: "ready" }
  | { kind: "already"; path: string }
  | { kind: "posting" }
  | { kind: "error"; message: string; signIn?: boolean };

export default function PostForm({ maxCaption }: { maxCaption: number }) {
  const router = useRouter();
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const [status, setStatus] = useState<Status>({ kind: "checking" });
  const [photo, setPhoto] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [caption, setCaption] = useState("");
  const [alt, setAlt] = useState("");
  // Bumped on each new pick, so a slow, superseded preparation is ignored.
  const pickId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/photos/today?tz=${encodeURIComponent(timeZone)}`)
      .then((r) => (r.ok ? r.json() : { path: null }))
      .then((d: { path: string | null }) => {
        if (!cancelled) setStatus(d.path ? { kind: "already", path: d.path } : { kind: "ready" });
      })
      .catch(() => !cancelled && setStatus({ kind: "ready" }));
    return () => {
      cancelled = true;
    };
  }, [timeZone]);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.url);
    },
    [photo],
  );

  async function onFile(file: File | undefined) {
    const id = ++pickId.current;
    setPhoto(null);
    if (!file) {
      setPreparing(false);
      return;
    }
    setPreparing(true);
    try {
      const prepared = await prepareImage(file);
      if (id !== pickId.current) {
        URL.revokeObjectURL(prepared.url);
        return;
      }
      setPhoto(prepared);
      if (status.kind === "error") setStatus({ kind: "ready" });
    } catch {
      if (id !== pickId.current) return;
      setStatus({ kind: "error", message: "We couldn't read that image. Please try a different photo." });
    } finally {
      if (id === pickId.current) setPreparing(false);
    }
  }

  const captionLength = graphemes(caption.trim());
  const altLength = graphemes(alt);
  const canPost =
    photo && !preparing && captionLength <= maxCaption && altLength <= MAX_ALT && status.kind !== "posting";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo || !canPost) return;
    setStatus({ kind: "posting" });
    const form = new FormData();
    form.set("image", photo.blob, "photo.jpg");
    form.set("width", String(photo.width));
    form.set("height", String(photo.height));
    form.set("caption", caption);
    form.set("alt", alt);
    form.set("timeZone", timeZone);
    try {
      const res = await fetch("/api/photos", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { path?: string; error?: string; code?: string };
      if (res.ok && data.path) {
        router.push(data.path);
        return;
      }
      if (data.code === "already_posted" && data.path) {
        setStatus({ kind: "already", path: data.path });
        return;
      }
      setStatus({
        kind: "error",
        message: data.error ?? "Something went wrong. Please try again.",
        signIn: data.code === "session_expired",
      });
    } catch {
      setStatus({ kind: "error", message: "Couldn't reach foto-log. Check your connection and try again." });
    }
  }

  if (status.kind === "checking") return <p className="muted">Checking today&apos;s photo…</p>;

  if (status.kind === "already") {
    return (
      <div className="notice">
        <p>
          <strong>You&apos;ve already posted today.</strong> Come back tomorrow for your next photo.
        </p>
        <p>
          <Link href={status.path}>See today&apos;s photo</Link>
        </p>
      </div>
    );
  }

  return (
    <form className="post-form" onSubmit={onSubmit}>
      <label htmlFor="photo">Photo</label>
      <input
        id="photo"
        type="file"
        accept="image/*"
        onChange={(e) => onFile(e.target.files?.[0])}
        disabled={preparing || status.kind === "posting"}
      />
      {preparing && <p className="hint">Preparing photo…</p>}
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="preview" src={photo.url} alt={alt || "Preview of your photo"} />
      )}

      <label htmlFor="caption">Caption</label>
      <textarea
        id="caption"
        rows={3}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        disabled={status.kind === "posting"}
      />
      <p className={`hint counter${captionLength > maxCaption ? " over" : ""}`}>
        {captionLength}/{maxCaption}
      </p>

      <label htmlFor="alt">Alt text</label>
      <textarea
        id="alt"
        rows={2}
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        placeholder="Describe the photo for people who can't see it"
        disabled={status.kind === "posting"}
      />
      {altLength > MAX_ALT && <p className="hint counter over">{altLength}/{MAX_ALT}</p>}

      {status.kind === "error" && (
        <p className="error" role="alert">
          {status.message} {status.signIn && <Link href="/login">Sign in</Link>}
        </p>
      )}

      <button type="submit" disabled={!canPost}>
        {status.kind === "posting" ? "Posting…" : "Post today's photo"}
      </button>
      <p className="hint">
        Your photo is resized and its location data is removed before upload. It&apos;s also
        posted to Bluesky with your caption and a link back here.
      </p>
    </form>
  );
}
