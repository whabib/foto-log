import Link from "next/link";
import { FriendCardList } from "@/app/components/friends/FriendCards";
import { type FriendCard, timeAgo } from "@/lib/friends";
import { resolveActor } from "@/lib/identity";
import { type IndexedPhoto, recentPhotos } from "@/lib/photo-index-server";
import { displayName, imageUrl, memberPath, photoKeyPath, thumbnailUrl } from "@/lib/photos/urls";
import { mostViewedToday, photoOfTheDay } from "@/lib/views-server";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** How many photos each side column shows. */
const COLUMN_PHOTOS = 6;

type Photo = IndexedPhoto & { name: string | null };
type Owned = Photo & { handle: string | null };

/** Adds each photo owner's current handle. */
async function withHandles(photos: Photo[]): Promise<Owned[]> {
  const actors = await Promise.all(photos.map((p) => resolveActor(p.did).catch(() => null)));
  return photos.map((p, i) => ({ ...p, handle: actors[i]?.handle ?? null }));
}

function toCard(p: Owned): FriendCard {
  const owner = { did: p.did, handle: p.handle, name: p.name };
  return {
    did: p.did,
    handle: p.handle,
    name: p.name,
    path: photoKeyPath(owner, p.rkey),
    thumbnail: thumbnailUrl(p.did, p.imageCid),
    alt: p.alt ?? "",
    createdAt: p.createdAt.toISOString(),
  };
}

/** Runs a loader, logging and falling back to `empty` if it fails, so one section can't break the page. */
async function safely<T>(what: string, load: () => Promise<T>, empty: T): Promise<T> {
  try {
    return await load();
  } catch (err) {
    log.error(`Couldn't load the home page's ${what}`, { err });
    return empty;
  }
}

async function loadHome() {
  const [recent, viewed, featured] = await Promise.all([
    safely("recent photos", () => recentPhotos(COLUMN_PHOTOS), [] as Photo[]),
    safely("most viewed fotologs", () => mostViewedToday(COLUMN_PHOTOS), [] as Photo[]),
    safely("Photo of the Day", () => photoOfTheDay(), null as Photo | null),
  ]);
  // No views yesterday: the newest photo stands in.
  const day = featured ?? recent[0] ?? null;
  const [recentOwned, viewedOwned, dayOwned] = await Promise.all([
    withHandles(recent),
    withHandles(viewed),
    withHandles(day ? [day] : []),
  ]);
  return { recent: recentOwned.map(toCard), viewed: viewedOwned.map(toCard), day: dayOwned[0] ?? null };
}

/** The home page: the Photo of the Day between the newest and the most viewed fotologs. */
export default async function Home() {
  const { recent, viewed, day } = await loadHome();
  // A server component renders once per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const dayOwner = day ? { did: day.did, handle: day.handle, name: day.name } : null;

  return (
    <main className="home">
      <h1 className="home-title">Welcome to Foto-log</h1>
      <div className="home-cols">
        <section className="home-center" aria-labelledby="photo-of-the-day">
          <h2 id="photo-of-the-day" className="home-day-heading">
            Photo of the Day
          </h2>
          {day && dayOwner ? (
            <figure className="home-day">
              <Link href={photoKeyPath(dayOwner, day.rkey)} aria-label={`${displayName(dayOwner)}'s photo`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(day.did, day.imageCid)} alt={day.alt ?? ""} />
              </Link>
              <figcaption>
                <Link href={memberPath(dayOwner)}>{displayName(dayOwner)}</Link>
                {" · "}
                <span className="home-when">{timeAgo(day.createdAt.toISOString(), now)}</span>
              </figcaption>
            </figure>
          ) : (
            <p className="home-empty">No photos yet.</p>
          )}
          <nav className="home-links" aria-label="More">
            <Link href="/members">Directory</Link>
            <Link href="/faq">FAQ</Link>
          </nav>
        </section>

        <section className="home-left" aria-labelledby="recent-heading">
          <h2 id="recent-heading" className="home-col-heading">
            Most Recently Uploaded Photos
          </h2>
          <FriendCardList cards={recent} now={now} isOwner={false} empty="No photos yet." />
        </section>

        <section className="home-right" aria-labelledby="viewed-heading">
          <h2 id="viewed-heading" className="home-col-heading">
            Most Viewed Fotologs Today
          </h2>
          <FriendCardList cards={viewed} now={now} isOwner={false} empty="No views yet today." />
        </section>
      </div>
    </main>
  );
}
