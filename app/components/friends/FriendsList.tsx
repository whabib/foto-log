import Link from "next/link";
import { type FriendRow, type FriendSort, sortFriends, timeAgo } from "@/lib/friends";
import type { Member } from "@/lib/member-resolve-server";
import { displayName, friendsPath, memberPath } from "@/lib/photos/urls";
import FriendButton from "./FriendButton";

/** The full Friends/Favorites list: one row per friend, with a Remove link for the owner. */
export default function FriendsList({
  owner,
  rows,
  sort,
  isOwner,
  now,
}: {
  owner: Member;
  rows: FriendRow[];
  sort: FriendSort;
  isOwner: boolean;
  now: number;
}) {
  const base = friendsPath(owner);
  return (
    <main className="friends-page">
      <div className="friends-page-head">
        <h2>
          Friends/Favorites <span className="friends-count">({rows.length})</span>
        </h2>
        {rows.length > 1 && (
          <p className="friends-sort">
            Sort by:{" "}
            {sort === "handle" ? <strong>Name</strong> : <Link href={base}>Name</Link>}
            {" | "}
            {sort === "recent" ? <strong>Latest upload</strong> : <Link href={`${base}?sort=recent`}>Latest upload</Link>}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rail-empty">
          {isOwner
            ? "Your Friends/Favorites is empty. Add members from their pages with “Add to Friends/Favorites”."
            : "No Friends/Favorites yet."}
        </p>
      ) : (
        <ul className="friends-list">
          {sortFriends(rows, sort).map((r) => {
            const name = displayName(r);
            const href = memberPath(r);
            return (
              <li key={r.did}>
                <Link href={href} className="friend-photo" aria-label={`${name}'s fotolog`}>
                  {r.latest ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.latest.thumbnail} alt={r.latest.alt} loading="lazy" />
                  ) : (
                    <span className="friend-no-photo">No photos yet</span>
                  )}
                </Link>
                <Link href={href} className="friend-name">
                  {name}
                </Link>
                {r.latest && <span className="friend-when">{timeAgo(r.latest.createdAt, now)}</span>}
                {isOwner && <FriendButton did={r.did} onList short />}
              </li>
            );
          })}
        </ul>
      )}
      <p className="rail-more">
        » <Link href={memberPath(owner)}>Back to {displayName(owner)}&rsquo;s fotolog</Link>
      </p>
    </main>
  );
}
