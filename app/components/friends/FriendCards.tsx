import Link from "next/link";
import { type FriendCard, timeAgo } from "@/lib/friends";
import { memberPath } from "@/lib/photos/urls";

/** The right column's cards: each friend's newest photo, handle and how long ago. */
export function FriendCardList({ cards, now, isOwner }: { cards: FriendCard[]; now: number; isOwner: boolean }) {
  if (cards.length === 0) {
    return (
      <p className="rail-empty">
        {isOwner ? "Add members from their pages to see their newest photos here." : "No friends' photos yet."}
      </p>
    );
  }
  return (
    <ul className="friend-cards">
      {cards.map((c) => {
        const name = c.handle ?? c.did;
        return (
          <li key={c.did}>
            <Link href={c.path} className="friend-photo" aria-label={`${name}'s newest photo`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.thumbnail} alt={c.alt} loading="lazy" />
            </Link>
            <span className="friend-when">{timeAgo(c.createdAt, now)}</span>
            <Link href={memberPath(c)} className="friend-name">
              {name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
