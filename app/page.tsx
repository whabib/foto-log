import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { timeAgo } from "@/lib/friends";
import { resolveActor } from "@/lib/identity";
import { recentPhotos } from "@/lib/photo-index-server";
import { displayName, memberPath, photoPath, thumbnailUrl } from "@/lib/photos/urls";

export const dynamic = "force-dynamic";

/** How many members' newest photos the home page shows. */
const HOME_PHOTOS = 30;

type Card = Awaited<ReturnType<typeof recentPhotos>>[number] & { handle: string | null };

async function loadCards(): Promise<Card[]> {
  try {
    const photos = await recentPhotos(HOME_PHOTOS);
    const actors = await Promise.all(photos.map((p) => resolveActor(p.did)));
    return photos.map((p, i) => ({ ...p, handle: actors[i]?.handle ?? null }));
  } catch (err) {
    console.error("Couldn't load recent photos", err);
    return [];
  }
}

/** The home page: the newest photo from each member who posted most recently. */
export default async function Home() {
  const [cards, user] = await Promise.all([loadCards(), getCurrentUser()]);
  // A server component renders once per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <main className="home">
      <section className="home-intro">
        <h1>One photo a day, on the open web.</h1>
        {user ? (
          <p>
            <Link href="/post">Post today&rsquo;s photo</Link>
          </p>
        ) : (
          <p>
            <Link href="/login">Sign in with Bluesky</Link> to start your own fotolog.
          </p>
        )}
      </section>
      <h2 className="home-heading">Recently updated fotologs</h2>
      {cards.length === 0 ? (
        <p className="home-empty">No photos yet.</p>
      ) : (
        <ul className="home-photos">
          {cards.map((c) => {
            const owner = { did: c.did, handle: c.handle, name: c.name };
            const name = displayName(owner);
            return (
              <li key={c.did}>
                <Link href={photoPath(owner, c.uploadDate)} className="home-photo" aria-label={`${name}'s newest photo`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbnailUrl(c.did, c.imageCid)} alt={c.alt ?? ""} loading="lazy" />
                </Link>
                <Link href={memberPath(owner)} className="home-name">
                  {name}
                </Link>
                <span className="home-when">{timeAgo(c.createdAt.toISOString(), now)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
