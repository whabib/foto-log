import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { currentIdentity, photoUrlFor } from "@/lib/photos/server";
import { maxCaptionGraphemes } from "@/lib/photos/text";
import PostForm from "./PostForm";

export const metadata: Metadata = { title: "Post a photo · foto-log" };

export default async function PostPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The link's length doesn't depend on which date it is.
  const maxCaption = maxCaptionGraphemes(photoUrlFor(await currentIdentity(user), "2000-01-01"));
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
