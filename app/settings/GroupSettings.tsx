"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { JoinPolicy, MembershipStatus } from "@/lib/groups-server";
import { displayName, memberPath } from "@/lib/photos/urls";
import { approveMemberAction, type GroupSettingsResult, removeMemberAction, setGroupAction } from "./actions";

export type GroupMember = { did: string; handle: string | null; name: string | null; status: MembershipStatus };

/**
 * In Settings' Profile: make the account a group, choose who can join, and
 * look after its members. Each change saves straight away, apart from the
 * form's Save.
 */
export default function GroupSettings({
  joinPolicy,
  members,
}: {
  /** The group's policy, or null when the account isn't a group. */
  joinPolicy: JoinPolicy | null;
  members: GroupMember[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<GroupSettingsResult>) =>
    start(async () => {
      const result = await action();
      setError(result.ok ? null : result.message);
      if (result.ok) router.refresh();
    });

  const errorLine = error && (
    <p className="field-error" role="alert">
      {error}
    </p>
  );

  if (joinPolicy === null) {
    return (
      <div className="field group-settings" id="group">
        <span className="label">Group</span>
        <p className="hint">
          Make this account a group: other members can ask to join it and post their photos to its fotolog, one
          a day each. You approve who joins (you can let anyone join later). Their photos are shared on Bluesky
          from this account, so foto-log stays signed in to it for them, even after you sign out here. To end
          that, choose Stop being a group, then sign out.
        </p>
        <button
          type="button"
          className="link-button"
          disabled={pending}
          onClick={() => {
            if (confirm("Make this account a group? Members will be able to post photos to it.")) {
              run(() => setGroupAction("approval"));
            }
          }}
        >
          {pending ? "Saving…" : "Make this account a group"}
        </button>
        {errorLine}
      </div>
    );
  }

  const waiting = members.filter((m) => m.status === "pending");
  const joined = members.filter((m) => m.status === "member");
  const row = (m: GroupMember, buttons: React.ReactNode) => (
    <li key={m.did}>
      <Link href={memberPath(m)}>{displayName(m)}</Link> {buttons}
    </li>
  );

  return (
    <div className="field group-settings" id="group">
      <span className="label">Group</span>
      <p className="hint">
        This account is a group. Members can post a photo to it once a day, so foto-log stays signed in to it
        even after you sign out. To end that, choose Stop being a group, then sign out.
      </p>
      <fieldset className="group-policy" disabled={pending}>
        <legend className="sr-only">Who can join</legend>
        <label>
          <input
            type="radio"
            name="joinPolicyChoice"
            checked={joinPolicy === "open"}
            onChange={() => run(() => setGroupAction("open"))}
          />{" "}
          Anyone can join
        </label>
        <label>
          <input
            type="radio"
            name="joinPolicyChoice"
            checked={joinPolicy === "approval"}
            onChange={() => run(() => setGroupAction("approval"))}
          />{" "}
          Members need my approval
        </label>
      </fieldset>

      {waiting.length > 0 && (
        <>
          <p className="group-list-heading">Waiting for approval</p>
          <ul className="group-members">
            {waiting.map((m) =>
              row(
                m,
                <>
                  <button type="button" className="link-button" disabled={pending} onClick={() => run(() => approveMemberAction(m.did))}>
                    Approve
                  </button>{" "}
                  <button type="button" className="link-button" disabled={pending} onClick={() => run(() => removeMemberAction(m.did))}>
                    Decline
                  </button>
                </>,
              ),
            )}
          </ul>
        </>
      )}

      <p className="group-list-heading">Members ({joined.length})</p>
      {joined.length === 0 ? (
        <p className="hint">No members yet.</p>
      ) : (
        <ul className="group-members">
          {joined.map((m) =>
            row(
              m,
              <button
                type="button"
                className="link-button"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Remove ${displayName(m)} from the group? Their photos stay on it.`)) {
                    run(() => removeMemberAction(m.did));
                  }
                }}
              >
                Remove
              </button>,
            ),
          )}
        </ul>
      )}

      <button
        type="button"
        className="link-button"
        disabled={pending}
        onClick={() => {
          if (confirm("Stop being a group? Everyone is taken out of it, its photos stay on this fotolog, and foto-log lets go of this account's sign-in when you sign out.")) {
            run(() => setGroupAction(null));
          }
        }}
      >
        Stop being a group
      </button>
      {errorLine}
    </div>
  );
}
