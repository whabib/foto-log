import { isValidDid } from "@atproto/syntax";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGroup, membership } from "@/lib/groups-server";
import { currentIdentity, GROUP_DAILY_LIMIT, longestPhotoUrl } from "@/lib/photos/server";
import { maxCaptionGraphemes } from "@/lib/photos/text";
import { displayName, memberPath } from "@/lib/photos/urls";
import PostForm from "./PostForm";

export const metadata: Metadata = { title: "Post a photo · foto-log" };

export default async function PostPage({ searchParams }: PageProps<"/post">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { group: groupParam } = await searchParams;
  // A group posting on its own goes through the group's daily keys and limits too.
  const groupDid =
    typeof groupParam === "string" && groupParam ? groupParam : (await getGroup(user.did)) ? user.did : null;

  if (groupDid) {
    if (!isValidDid(groupDid)) notFound();
    const [group, groupIdentity, status, me] = await Promise.all([
      getGroup(groupDid),
      currentIdentity({ did: groupDid, handle: null }),
      membership(groupDid, user.did),
      // A member's post on the group's Bluesky names them, which takes room from the caption.
      groupDid === user.did ? null : currentIdentity(user),
    ]);
    if (!group) notFound();
    const name = displayName(groupIdentity);
    const canPost = groupDid === user.did || status === "member";
    return (
      <main className="post-page">
        <h1>Post to {name}</h1>
        {canPost ? (
          <>
            <p className="muted">
              One photo a day from each member. It goes on the group&apos;s fotolog with your name, and is
              shared as a post from the group&apos;s Bluesky account that names you. The group takes up to {GROUP_DAILY_LIMIT}{" "}
              photos a day.
            </p>
            <PostForm
              maxCaption={maxCaptionGraphemes(longestPhotoUrl(groupIdentity, true), me?.handle)}
              group={{ did: groupDid }}
            />
          </>
        ) : (
          <div className="notice">
            <p>
              {status === "pending"
                ? "Your request to join this group is waiting for approval."
                : "Only members can post to this group."}
            </p>
            <p>
              <Link href={memberPath(groupIdentity)}>Back to {name}</Link>
            </p>
          </div>
        )}
      </main>
    );
  }

  // The link's length doesn't depend on which date it is.
  const maxCaption = maxCaptionGraphemes(longestPhotoUrl(await currentIdentity(user), false));
  return (
    <main className="post-page">
      <h1>Post today&apos;s photo</h1>
      <p className="muted">
        One photo a day. It goes on your fotolog and is also shared as a post on Bluesky.
      </p>
      <PostForm maxCaption={maxCaption} />
    </main>
  );
}
