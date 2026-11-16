"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reauthorize } from "@/app/login/actions";
import { type FriendState, setFriendAction } from "./actions";

/**
 * "Add to Friends/Favorites" or "Remove from Friends/Favorites" under
 * another member's photo, or a short "Remove" on a row of the full list.
 */
export default function FriendButton({ did, onList, short = false }: { did: string; onList: boolean; short?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<Extract<FriendState, { status: "error" }> | null>(null);
  const label = short ? (onList ? "Remove" : "Add") : onList ? "Remove from Friends/Favorites" : "Add to Friends/Favorites";
  const Wrapper = short ? "span" : "p";
  return (
    <Wrapper className={short ? "friend-toggle-short" : "friend-toggle"}>
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
