import Link from "next/link";
import type { CSSProperties } from "react";
import LocalTime from "@/app/components/LocalTime";
import ShareButton from "@/app/components/ShareButton";
import Guestbook from "@/app/components/guestbook/Guestbook";
import type { Guestbook as GuestbookData } from "@/lib/guestbook/entries";
import DeleteButton from "@/app/[actor]/[date]/DeleteButton";
import { baseUrl } from "@/lib/config";
import type { Actor } from "@/lib/identity";
import { isHexColor, type MemberPageLook } from "@/lib/member-settings";
import { parsePhotoRecordKey } from "@/lib/photo-record";
import type { StoredPhoto } from "@/lib/photos/server";
import { blueskyPostUrl, imageUrl, memberPath, photoPath, thumbnailUrl } from "@/lib/photos/urls";

/** Formats a YYYY-MM-DD calendar date, e.g. "October 14, 2026". It's a date, not an instant. */
export function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Short calendar date for thumbnails, e.g. "10/14/26". */
function formatShortDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The page of a stored photo. One photo a day for now, so that's its upload date's page. */
export function storedPhotoPath(owner: Actor, photo: StoredPhoto): string {
  const key = parsePhotoRecordKey(photo.rkey);
  return photoPath(owner, key?.uploadDate ?? photo.record.uploadDate);
}

export type MemberPageProps = {
  owner: Actor;
  look: MemberPageLook;
  avatar: string | null;
  /** The photo in the center, or null if the member has none yet. */
  photo: StoredPhoto | null;
  /** The member's newest photos, newest first. */
  recent: StoredPhoto[];
  older: StoredPhoto | null;
  newer: StoredPhoto | null;
  guestbook: GuestbookData | null;
  isOwner: boolean;
  signedIn: boolean;
};

export default function MemberPage(props: MemberPageProps) {
  const { owner, look, avatar, photo, recent, older, newer, isOwner, signedIn } = props;
  const who = owner.handle ?? owner.did;
  const theme = {
    "--m-bg": look.backgroundColor,
    "--m-fg": look.textColor,
    "--m-link": look.linkColor,
  } as CSSProperties;
  // The site header sits outside this component, so give it the member's
  // colors through page-level variables. Only plain hex colors get here.
  const colors = [look.backgroundColor, look.textColor, look.linkColor];
  const headerStyle = colors.every(isHexColor)
    ? `:root{--m-bg:${colors[0]};--m-fg:${colors[1]};--m-link:${colors[2]}}`
    : "";

  return (
    <div className="member-theme" style={theme}>
      {headerStyle && <style>{headerStyle}</style>}
      <div className="member-box">
        <header className="member-title">
          <h1>{look.title}</h1>
        </header>

        <div className="member-cols">
          <main className="member-center">
            {photo ? <CenterPhoto {...props} photo={photo} older={older} newer={newer} /> : <NoPhotos isOwner={isOwner} />}
          </main>

          <aside className="member-left">
            <h2 className="member-name">
              <Link href={memberPath(owner)}>{who}</Link>
            </h2>
            <div className="about-me">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avatar" src={avatar} alt="" width={50} height={50} />
              ) : (
                <div className="avatar avatar-empty" aria-hidden="true" />
              )}
              {look.location && <p className="location">{look.location}</p>}
            </div>

            <h3 className="rail-heading">Recent Photos</h3>
            {recent.length > 0 ? (
              <ul className="recent-photos">
                {recent.map((p) => (
                  <li key={p.rkey} className={p.rkey === photo?.rkey ? "selected" : undefined}>
                    <Link href={storedPhotoPath(owner, p)} aria-current={p.rkey === photo?.rkey ? "page" : undefined}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbnailUrl(owner.did, p.record.image.ref.toString())} alt={p.record.alt ?? ""} loading="lazy" />
                      <span className="date">{formatShortDay(p.record.displayDate)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rail-empty">No photos yet.</p>
            )}
            {/* The archive page comes later; until then this goes to the latest photo. */}
            <p className="rail-more">
              » <Link href={memberPath(owner)}>View all photos</Link>
            </p>
          </aside>

          <aside className="member-right">
            <h3 className="rail-heading">Friends/Favorites</h3>
            <p className="rail-empty">Coming soon.</p>
            <h3 className="rail-heading">Groups</h3>
            <p className="rail-empty">Coming soon.</p>
          </aside>
        </div>
      </div>
      {!signedIn && (
        <p className="member-signup">
          <Link href="/login">Sign in</Link> to start your own fotolog.
        </p>
      )}
    </div>
  );
}

function CenterPhoto({
  owner,
  photo,
  older,
  newer,
  isOwner,
  guestbook,
  signedIn,
}: MemberPageProps & { photo: StoredPhoto }) {
  const { record } = photo;
  const bskyUrl = blueskyPostUrl(record.post.uri);
  const permalink = storedPhotoPath(owner, photo);
  return (
    <>
      <nav className="photo-nav" aria-label="Photos">
        {older ? (
          <Link href={storedPhotoPath(owner, older)} rel="prev" aria-label="Previous photo">
            ‹
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
        {newer ? (
          <Link href={storedPhotoPath(owner, newer)} rel="next" aria-label="Next photo">
            ›
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
      </nav>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="photo"
        src={imageUrl(owner.did, record.image.ref.toString())}
        alt={record.alt ?? ""}
        width={record.aspectRatio?.width}
        height={record.aspectRatio?.height}
      />

      <p className="photo-util">
        <Link href={permalink}>Permalink</Link>
        {bskyUrl && (
          <>
            {" | "}
            <a href={bskyUrl}>View on Bluesky</a>
            {" | "}
            {/* Reports go through Bluesky's moderation, from the post's menu. */}
            <a href={bskyUrl} title="Open the post on Bluesky and use its menu to report it">
              Report photo
            </a>
          </>
        )}
        {" | "}
        <ShareButton url={`${baseUrl}${permalink}`} title={record.caption ?? formatDay(record.displayDate)} />
      </p>

      <div className="photo-text">
        {record.caption && <h2 className="caption">{record.caption}</h2>}
        <p className="photo-date">
          <time dateTime={record.displayDate}>{formatDay(record.displayDate)}</time>
        </p>
        <p className="uploaded">
          Photo uploaded at <LocalTime iso={record.createdAt} format="time" />
        </p>
      </div>

      {isOwner && (
        <div className="owner-actions">
          <DeleteButton rkey={photo.rkey} />
        </div>
      )}

      <Guestbook
        guestbook={guestbook ?? { entries: [], count: 0, closed: false, gated: false }}
        ownerDid={owner.did}
        rkey={photo.rkey}
        bskyUrl={bskyUrl}
        signedIn={signedIn}
      />
    </>
  );
}

function NoPhotos({ isOwner }: { isOwner: boolean }) {
  return (
    <div className="no-photos">
      <p>No photos yet.</p>
      {isOwner && (
        <p>
          <Link href="/post">Post your first photo</Link>
        </p>
      )}
    </div>
  );
}
