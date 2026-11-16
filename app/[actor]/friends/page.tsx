import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import FriendsList from "@/app/components/friends/FriendsList";
import { MemberFrame } from "@/app/components/MemberPage";
import { getCurrentUser } from "@/lib/auth";
import { type FriendSort, parseFriendSort } from "@/lib/friends";
import { allFriends } from "@/lib/friends-server";
import { type Member, resolveMemberPage } from "@/lib/member-resolve-server";
import { getMemberImages } from "@/lib/member-profile-server";
import { memberPageLook } from "@/lib/member-settings";
import { getMemberSettings } from "@/lib/member-settings-server";
import { displayName } from "@/lib/photos/urls";

type Props = { params: Promise<{ actor: string }>; searchParams: Promise<{ sort?: string | string[] }> };

function loadOwner(actorParam: string) {
  return resolveMemberPage(actorParam, "/friends");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const owner = await loadOwner((await params).actor);
  if (!owner) return { title: "Member not found · foto-log" };
  return { title: `${displayName(owner)}'s Friends/Favorites · foto-log` };
}

/** Everyone on a member's Friends/Favorites, sorted by handle or by newest photo. */
export default async function FriendsPage({ params, searchParams }: Props) {
  const owner = await loadOwner((await params).actor);
  if (!owner) notFound();
  const sort = parseFriendSort((await searchParams).sort);
  const [settings, images, user] = await Promise.all([
    getMemberSettings(owner.did),
    getMemberImages(owner),
    getCurrentUser(),
  ]);
  const isOwner = user?.did === owner.did;
  return (
    <MemberFrame owner={owner} look={memberPageLook(settings, owner)} images={images} signedIn={user !== null}>
      {/* A long list takes a while to read from the PDS, so it streams in. */}
      <Suspense key={sort} fallback={<p className="friends-page rail-empty">Loading Friends/Favorites…</p>}>
        <LoadedFriendsList owner={owner} sort={sort} isOwner={isOwner} />
      </Suspense>
    </MemberFrame>
  );
}

async function LoadedFriendsList({ owner, sort, isOwner }: { owner: Member; sort: FriendSort; isOwner: boolean }) {
  const rows = await allFriends(owner);
  // A server component renders once per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  return <FriendsList owner={owner} rows={rows} sort={sort} isOwner={isOwner} now={now} />;
}
