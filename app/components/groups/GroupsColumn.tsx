import { FriendCardList } from "@/app/components/friends/FriendCards";
import { groupCards } from "@/lib/group-cards-server";
import type { Actor } from "@/lib/identity";

/** The groups `owner` belongs to, each with its newest photo, newest first. */
export default async function GroupsColumn({ owner, isOwner }: { owner: Actor; isOwner: boolean }) {
  const cards = await groupCards(owner.did);
  return (
    <FriendCardList
      cards={cards}
      // A server component renders once per request, so reading the clock here is fine.
      // eslint-disable-next-line react-hooks/purity
      now={Date.now()}
      isOwner={isOwner}
      empty={isOwner ? "Join groups from their pages to see their newest photos here." : "No groups yet."}
    />
  );
}
