import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import LocalTime from "@/app/components/LocalTime";
import { getCurrentUser } from "@/lib/auth";
import { resolveActor } from "@/lib/identity";
import { memberPageLook } from "@/lib/member-settings";
import { getMemberSettings } from "@/lib/member-settings-server";
import { isValidDateKey, photoRecordKey } from "@/lib/photo-record";
import { fetchPhoto } from "@/lib/photos/server";
import { blueskyPostUrl, imageUrl, parseActorParam } from "@/lib/photos/urls";
import DeleteButton from "./DeleteButton";

type Props = { params: Promise<{ actor: string; date: string }> };

// Shared by generateMetadata and the page, so each request resolves once.
const loadPhoto = cache(async (actor: string, date: string) => {
  const id = parseActorParam(actor);
  if (!id || !isValidDateKey(date)) return null;
  const owner = await resolveActor(id);
  if (!owner) return null;
  // One photo a day for now, so the day's photo is always -01.
  const photo = await fetchPhoto(owner, photoRecordKey(date, 1));
  return photo ? { owner, photo } : null;
});

async function load(params: Props["params"]) {
  const { actor, date } = await params;
  return loadPhoto(actor, date);
}

/** Formats a YYYY-MM-DD calendar date, e.g. "October 14, 2026". It's a date, not an instant. */
function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load(params);
  if (!data) return { title: "Photo not found · foto-log" };
  const { owner, photo } = data;
  const who = owner.handle ? `@${owner.handle}` : owner.did;
  return {
    title: `${who} · ${formatDay(photo.record.displayDate)} · foto-log`,
    description: photo.record.caption,
    openGraph: { images: [imageUrl(owner.did, photo.record.image.ref.toString())] },
  };
}

export default async function PhotoPage({ params }: Props) {
  const data = await load(params);
  if (!data) notFound();
  const { owner, photo } = data;
  const { record } = photo;
  const user = await getCurrentUser();
  const isOwner = user?.did === owner.did;
  const who = owner.handle ? `@${owner.handle}` : owner.did;
  const bskyUrl = blueskyPostUrl(record.post.uri);
  const look = memberPageLook(await getMemberSettings(owner.did), owner);

  return (
    <div className="member-theme" style={{ backgroundColor: look.backgroundColor, color: look.textColor }}>
      <main className="photo-page">
        <header className="member-header">
          <h1>{look.title}</h1>
          {look.location && <p>{look.location}</p>}
        </header>
        <header className="photo-meta">
          <span className="photo-owner">{who}</span>
          <time dateTime={record.displayDate}>{formatDay(record.displayDate)}</time>
        </header>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="photo"
          src={imageUrl(owner.did, record.image.ref.toString())}
          alt={record.alt ?? ""}
          width={record.aspectRatio?.width}
          height={record.aspectRatio?.height}
        />
        {record.caption && <p className="caption">{record.caption}</p>}
        <p className="hint">
          Posted <LocalTime iso={record.createdAt} />
          {bskyUrl && (
            <>
              {" · "}
              <a href={bskyUrl}>View on Bluesky</a>
            </>
          )}
        </p>
        {isOwner && (
          <div className="owner-actions">
            <DeleteButton rkey={photo.rkey} />
          </div>
        )}
        {!user && (
          <p className="hint">
            <Link href="/login">Sign in</Link> to start your own fotolog.
          </p>
        )}
      </main>
    </div>
  );
}
