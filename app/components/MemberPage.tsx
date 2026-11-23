import Link from "next/link";
import { type CSSProperties, type ReactNode, Suspense } from "react";
import FriendButton from "@/app/components/friends/FriendButton";
import FriendsColumn from "@/app/components/friends/FriendsColumn";
import GroupBox from "@/app/components/groups/GroupBox";
import GroupsColumn from "@/app/components/groups/GroupsColumn";
import Guestbook from "@/app/components/guestbook/Guestbook";
import { EMPTY_GUESTBOOK, type Guestbook as GuestbookData } from "@/lib/guestbook/entries";
import DeleteButton from "@/app/[actor]/[date]/DeleteButton";
import type { GroupInfo } from "@/lib/member-page-data";
import type { Member } from "@/lib/member-resolve-server";
import { isHexColor, type MemberPageLook } from "@/lib/member-settings";
import type { StoredPhoto } from "@/lib/photos/server";
import { formatPhotoTime } from "@/lib/photo-time";
import type { MemberImages } from "@/lib/member-profile";
import {
  blueskyPostUrl,
  displayName,
  friendsPath,
  imageUrl,
  memberImageUrl,
  type MemberRef,
  memberPath,
  photoCalendarPath,
  photoKeyPath,
  thumbnailUrl,
} from "@/lib/photos/urls";

/** Formats a YYYY-MM-DD calendar date, e.g. "October 14, 2026". It's a date, not an instant. */
export function formatDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Short calendar date for thumbnails, e.g. "Oct 14, 2026". */
function formatShortDay(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** The page of a stored photo: its day's page for the day's first, else its own key's (groups have several a day). */
export function storedPhotoPath(owner: Member, photo: StoredPhoto): string {
  return photoKeyPath(owner, photo.rkey);
}

export type MemberPageProps = {
  owner: Member;
  look: MemberPageLook;
  avatar: string | null;
  /** The photo in the center, or null if the member has none yet. */
  photo: StoredPhoto | null;
  /** The member's newest photos, newest first. */
  recent: StoredPhoto[];
  older: StoredPhoto | null;
  newer: StoredPhoto | null;
  guestbook: GuestbookData | null;
  /** Images from the member's com.foto-log.profile record. */
  images?: MemberImages;
  isOwner: boolean;
  signBlocked?: string | null;
  signedIn: boolean;
  /** Whether the owner is on the signed-in viewer's Friends/Favorites; null when there's no toggle to show. */
  onViewerList?: boolean | null;
  /** Whether the page's owner is a foto-log member, so the viewer can add them. */
  canAdd?: boolean;
  /** The right column, which streams in. Pages that render statically can pass it in place of the live one. */
  friends?: ReactNode;
  /** The right column's Groups, which streams in; static pages can pass their own. */
  groups?: ReactNode;
  /** When the owner is a group: its size and the viewer's membership. */
  group?: GroupInfo | null;
  /** On a group, the member who posted the center photo. */
  uploader?: MemberRef | null;
};

export default function MemberPage(props: MemberPageProps) {
  const { owner, look, avatar, photo, recent, older, newer, isOwner, signedIn, images } = props;
  const who = displayName(owner);

  return (
    <MemberFrame
      owner={owner}
      look={look}
      images={images}
      signedIn={signedIn}
      description={props.group?.description}
    >
        <div className="member-cols">
          <main className="member-center">
            {photo ? (
              <CenterPhoto {...props} photo={photo} older={older} newer={newer} />
            ) : (
              <>
                <NoPhotos
                  isOwner={isOwner}
                  postHref={
                    props.group && (isOwner || props.group.viewer === "member")
                      ? `/post?group=${encodeURIComponent(owner.did)}`
                      : isOwner
                        ? "/post"
                        : null
                  }
                />
                {props.onViewerList != null && (
                  <FriendButton did={owner.did} onList={props.onViewerList} canAdd={props.canAdd} handle={owner.handle} />
                )}
              </>
            )}
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
            {props.group && (
              <GroupBox
                groupDid={owner.did}
                members={props.group.members}
                joinPolicy={props.group.joinPolicy}
                viewer={props.group.viewer}
                isOwner={isOwner}
                signedIn={signedIn}
              />
            )}

            <h3 className="rail-heading">
              <Link href={photoCalendarPath(owner)}>Recent Photos</Link>
            </h3>
            {recent.length > 0 ? (
              <ul className="recent-photos">
                {recent.map((p) => (
                  <li key={p.rkey} className={p.rkey === photo?.rkey ? "selected" : undefined}>
                    {/* The date is outside the link, so a photo without alt text needs a label for screen readers. */}
                    <Link
                      href={storedPhotoPath(owner, p)}
                      aria-current={p.rkey === photo?.rkey ? "page" : undefined}
                      aria-label={p.record.alt ? undefined : `Photo from ${formatShortDay(p.record.displayDate)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbnailUrl(owner.did, p.record.image.ref.toString())} alt={p.record.alt ?? ""} loading="lazy" />
                    </Link>
                    <time className="date" dateTime={p.record.displayDate}>
                      {formatShortDay(p.record.displayDate)}
                    </time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rail-empty">No photos yet.</p>
            )}
            <p className="rail-more">
              » <Link href={photoCalendarPath(owner)}>All Photos</Link>
            </p>
            <p className="rail-more rail-more-spaced">
              » <Link href="/members">Member Directory</Link>
            </p>
          </aside>

          <aside className="member-right">
            <h3 className="rail-heading">
              <Link href={friendsPath(owner)}>Friends/Favorites</Link>
            </h3>
            {props.friends ?? (
              <Suspense fallback={<p className="rail-empty">Loading friends&rsquo; photos…</p>}>
                <FriendsColumn owner={owner} isOwner={isOwner} />
              </Suspense>
            )}
            <h3 className="rail-heading">
              <Link href="/groups">Groups</Link>
            </h3>
            {props.groups ?? (
              <Suspense fallback={<p className="rail-empty">Loading groups…</p>}>
                <GroupsColumn owner={owner} isOwner={isOwner} />
              </Suspense>
            )}
            <p className="rail-more">
              » <Link href="/groups">All Groups</Link>
            </p>
          </aside>
        </div>
    </MemberFrame>
  );
}

/**
 * A member's colors, wallpaper and title around `children`, for every page
 * of their fotolog.
 */
export function MemberFrame({
  owner,
  look,
  images,
  signedIn,
  description,
  children,
}: {
  owner: Member;
  look: MemberPageLook;
  images?: MemberImages;
  signedIn: boolean;
  /** A group's Bluesky profile description, shown under its title. */
  description?: string | null;
  children: ReactNode;
}) {
  const titleImage = images?.titleImage ?? null;
  const wallpaper = images?.wallpaper ?? null;
  const theme = {
    "--m-bg": look.backgroundColor,
    "--m-fg": look.textColor,
    "--m-link": look.linkColor,
    ...(wallpaper && {
      // The URL is built from a DID and a CID, neither of which can contain quotes.
      backgroundImage: `url("${memberImageUrl(owner.did, wallpaper.cid)}")`,
    }),
  } as CSSProperties;
  const wallpaperClass = wallpaper ? (images?.wallpaperMode === "fill" ? " wallpaper-fill" : " wallpaper-tile") : "";
  // The site header sits outside this component, so give it the member's
  // colors through page-level variables. Only plain hex colors get here.
  const colors = [look.backgroundColor, look.textColor, look.linkColor];
  const headerStyle = colors.every(isHexColor)
    ? `:root{--m-bg:${colors[0]};--m-fg:${colors[1]};--m-link:${colors[2]}}`
    : "";

  return (
    <div className={`member-theme${wallpaperClass}`} style={theme}>
      {headerStyle && <style>{headerStyle}</style>}
      <div className="member-box">
        <header className={titleImage ? "member-title has-image" : "member-title"}>
          <h1>
            <Link href={memberPath(owner)} className="member-title-link">
              {titleImage ? (
                // The text title is the alt text, so it shows if the image doesn't load.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="title-image"
                  src={memberImageUrl(owner.did, titleImage.cid)}
                  alt={look.title}
                  width={titleImage.width ?? undefined}
                  height={titleImage.height ?? undefined}
                />
              ) : (
                look.title
              )}
            </Link>
          </h1>
          {description && <p className="member-description">{description}</p>}
        </header>
        {children}
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
  signBlocked,
  onViewerList,
  canAdd,
  uploader,
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

      <div className="photo-util">
        <p>
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
        </p>
        {/* The owner's Delete and a visitor's Add/Remove never show together. */}
        {isOwner && <DeleteButton rkey={photo.rkey} />}
        {onViewerList != null && (
          <FriendButton did={owner.did} onList={onViewerList} canAdd={canAdd} handle={owner.handle} inline />
        )}
      </div>

      <div className="photo-text">
        {/* When it was posted, in the poster's time zone: "Nov 17, 2026, 11:57 AM ET". */}
        <p className="photo-date">
          <time dateTime={record.createdAt}>{formatPhotoTime(record.createdAt, record.timeZone)}</time>
          {uploader && (
            <>
              {" by "}
              <Link href={memberPath(uploader)}>{displayName(uploader)}</Link>
            </>
          )}
        </p>
        {record.caption && <h2 className="caption">{record.caption}</h2>}
      </div>

      <Guestbook
        guestbook={guestbook ?? EMPTY_GUESTBOOK}
        ownerDid={owner.did}
        rkey={photo.rkey}
        bskyUrl={bskyUrl}
        signedIn={signedIn}
        isOwner={isOwner}
        signBlocked={signBlocked ?? null}
      />
    </>
  );
}

function NoPhotos({ isOwner, postHref }: { isOwner: boolean; postHref: string | null }) {
  return (
    <div className="no-photos">
      <p>No photos yet.</p>
      {postHref && (
        <p>
          <Link href={postHref}>{isOwner ? "Post your first photo" : "Post the first photo"}</Link>
        </p>
      )}
    </div>
  );
}
