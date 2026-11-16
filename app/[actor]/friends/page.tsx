import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FriendsList from "@/app/components/friends/FriendsList";
import { MemberFrame } from "@/app/components/MemberPage";
import { getCurrentUser } from "@/lib/auth";
import { parseFriendSort } from "@/lib/friends";
import { allFriends } from "@/lib/friends-server";
import { resolveActor } from "@/lib/identity";
import { getMemberImages } from "@/lib/member-profile-server";
import { memberPageLook } from "@/lib/member-settings";
import { getMemberSettings } from "@/lib/member-settings-server";
import { parseActorParam } from "@/lib/photos/urls";

type Props = { params: Promise<{ actor: string }>; searchParams: Promise<{ sort?: string | string[] }> };

async function loadOwner(actorParam: string) {
  const id = parseActorParam(actorParam);
  return id ? resolveActor(id) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const owner = await loadOwner((await params).actor);
  if (!owner) return { title: "Member not found · foto-log" };
  return { title: `${owner.handle ?? owner.did}'s Friends/Favorites · foto-log` };
}

/** Everyone on a member's Friends/Favorites, sorted by handle or by newest photo. */
export default async function FriendsPage({ params, searchParams }: Props) {
  const owner = await loadOwner((await params).actor);
  if (!owner) notFound();
  const sort = parseFriendSort((await searchParams).sort);
  const [rows, settings, images, user] = await Promise.all([
    allFriends(owner),
    getMemberSettings(owner.did),
    getMemberImages(owner),
    getCurrentUser(),
  ]);
  // A server component renders once per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return (
    <MemberFrame owner={owner} look={memberPageLook(settings, owner)} images={images} signedIn={user !== null}>
      <FriendsList owner={owner} rows={rows} sort={sort} isOwner={user?.did === owner.did} now={now} />
    </MemberFrame>
  );
}
