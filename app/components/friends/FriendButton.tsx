"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reauthorize } from "@/app/login/actions";
import { type FriendState, setFriendAction } from "./actions";

/** A Bluesky post draft inviting `handle` to foto-log, for the viewer to edit and send. */
function inviteUrl(handle: string | null): string {
  const text = `${handle ? `@${handle} ` : ""}Start your fotolog: one photo a day, at https://foto-log.com`;
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`;
}

/**
 * "Add to Friends/Favorites" or "Remove from Friends/Favorites" at the
 * right end of the links under another member's photo (`inline`), on its
 * own line when there's no photo, or a short "Remove" on a row of the full
 * list. For someone who hasn't joined foto-log, an invite instead of Add.
 */
export default function FriendButton({
  did,
  onList,
  short = false,
  canAdd = true,
  handle = null,
  inline = false,
}: {
  did: string;
  onList: boolean;
  short?: boolean;
  canAdd?: boolean;
  handle?: string | null;
  /** In the row of links under a photo, where the owner's Delete photo goes. */
  inline?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<Extract<FriendState, { status: "error" }> | null>(null);
  const label = short ? (onList ? "Remove" : "Add") : onList ? "Remove from Friends/Favorites" : "Add to Friends/Favorites";
  const Wrapper = short || inline ? "span" : "p";
  const className = short ? "friend-toggle-short" : inline ? "photo-util-end" : "friend-toggle";
  if (!onList && !canAdd) {
    return (
      <Wrapper className={className}>
        <a href={inviteUrl(handle)} target="_blank" rel="noopener noreferrer">
          Invite this person to Fotolog!
        </a>
      </Wrapper>
    );
  }
  return (
    <Wrapper className={className}>
      <button
        type="button"
        className="link-button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await setFriendAction(did, !onList);
            if (result.status === "error") {
              setError(result);
            } else {
              setError(null);
              router.refresh();
            }
          })
        }
      >
        {pending ? (onList ? "Removing…" : "Adding…") : label}
      </button>
      {error && (
        <span className="error" role="alert">
          {" "}
          {error.message}{" "}
          {error.signIn && (
            <button type="button" className="link-button" onClick={() => start(() => reauthorize())}>
              Sign in again
            </button>
          )}
        </span>
      )}
    </Wrapper>
  );
}
