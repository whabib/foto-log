"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { JoinPolicy, MembershipStatus } from "@/lib/groups-server";
import { setMembershipAction } from "./actions";

/**
 * The left column's group panel: how many members, and the viewer's way in
 * (Join, Request to join), out (Leave) or to post.
 */
export default function GroupBox({
  groupDid,
  members,
  joinPolicy,
  viewer,
  isOwner,
  signedIn,
}: {
  groupDid: string;
  members: number;
  joinPolicy: JoinPolicy;
  viewer: MembershipStatus | null;
  isOwner: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const change = (join: boolean) =>
    start(async () => {
      const result = await setMembershipAction(groupDid, join);
      if (result.status === "error") {
        setError(result.message);
      } else {
        setError(null);
        router.refresh();
      }
    });

  const postHref = `/post?group=${encodeURIComponent(groupDid)}`;
  let actions: React.ReactNode;
  if (isOwner) {
    actions = (
      <>
        <li>
          <Link href={postHref}>Post a photo to this group</Link>
        </li>
        <li>
          <Link href="/settings#group">Manage members</Link>
        </li>
      </>
    );
  } else if (!signedIn) {
    actions = (
      <li>
        <Link href="/login">Sign in</Link> to join this group.
      </li>
    );
  } else if (viewer === "member") {
    actions = (
      <>
        <li>
          <Link href={postHref}>Post a photo to this group</Link>
        </li>
        <li>
          <button
            type="button"
            className="link-button"
            disabled={pending}
            onClick={() => {
              if (confirm("Leave this group? Your photos stay on it.")) change(false);
            }}
          >
            {pending ? "Leaving…" : "Leave group"}
          </button>
        </li>
      </>
    );
  } else if (viewer === "pending") {
    actions = (
      <li>
        Your request is waiting for approval.{" "}
        <button type="button" className="link-button" disabled={pending} onClick={() => change(false)}>
          {pending ? "Withdrawing…" : "Withdraw"}
        </button>
      </li>
    );
  } else {
    actions = (
      <li>
        <button type="button" className="link-button" disabled={pending} onClick={() => change(true)}>
          {pending ? "Joining…" : joinPolicy === "open" ? "Join this group" : "Ask to join this group"}
        </button>
      </li>
    );
  }

  return (
    <div className="group-box">
      <p className="group-kind">
        Group · {members} {members === 1 ? "member" : "members"}
      </p>
      <ul className="group-actions">{actions}</ul>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
