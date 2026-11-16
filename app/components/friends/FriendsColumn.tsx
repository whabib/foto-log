import { friendCards } from "@/lib/friends-server";
import type { Actor } from "@/lib/identity";
import { FriendCardList } from "./FriendCards";

/**
 * The page owner's Friends/Favorites cards. Reads the list from their PDS,
 * so the page streams it in rather than waiting for it.
 */
export default async function FriendsColumn({ owner, isOwner }: { owner: Actor; isOwner: boolean }) {
  const cards = await friendCards(owner);
  // A server component renders once per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  return <FriendCardList cards={cards} now={Date.now()} isOwner={isOwner} />;
}
