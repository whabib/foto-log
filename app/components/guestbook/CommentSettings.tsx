"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import type { WhoCanSign, WhoCanSignChoice } from "@/lib/guestbook/entries";
import { type OwnerState, setWhoCanSignAction } from "./actions";

/** The owner's gear on the guestbook heading, opening Bluesky-style "who can comment" settings. */
export default function CommentSettings({ ownerDid, rkey, who }: { ownerDid: string; rkey: string; who: WhoCanSign }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"everyone" | "nobody" | "some">("everyone");
  const [followers, setFollowers] = useState(false);
  const [following, setFollowing] = useState(false);
  const [state, action, pending] = useActionState<OwnerState, FormData>(
    async (prev, form) => {
      const result = await setWhoCanSignAction(ownerDid, rkey, prev, form);
      if (result.status === "done") {
        dialog.current?.close();
        router.refresh();
      }
      return result;
    },
    { status: "idle" },
  );

  const open = () => {
    // Start from what's saved now.
    setMode(who === "everyone" || who === "custom" ? "everyone" : who === "nobody" ? "nobody" : "some");
    setFollowers(who === "followers" || who === "followers+following");
    setFollowing(who === "following" || who === "followers+following");
    dialog.current?.showModal();
  };

  const toggle = (which: "followers" | "following", on: boolean) => {
    const f = which === "followers" ? on : followers;
    const g = which === "following" ? on : following;
    setFollowers(f);
    setFollowing(g);
    setMode(f || g ? "some" : "everyone");
  };

  const choice: WhoCanSignChoice =
    mode !== "some" ? mode : followers && following ? "followers+following" : followers ? "followers" : "following";

  return (
    <>
      <button type="button" className="gear" onClick={open} aria-label="Comment settings" title="Comment settings">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
            transform="translate(-1 0)"
          />
        </svg>
      </button>
      <dialog
        ref={dialog}
        className="comment-settings"
        aria-labelledby="comment-settings-title"
        onClick={(e) => {
          // A click on the backdrop closes it.
          if (e.target === dialog.current) dialog.current.close();
        }}
      >
        <form action={action}>
          <input type="hidden" name="who" value={choice} />
          <h2 id="comment-settings-title">Comment settings</h2>
          <p className="hint">These are saved to your Bluesky post, so Bluesky apps follow them too.</p>
          <h3>Who can comment</h3>
          <div className="mode-buttons">
            {(["everyone", "nobody"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={mode === m ? "selected" : undefined}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  setFollowers(false);
                  setFollowing(false);
                }}
              >
                {m === "everyone" ? "Anyone" : "Nobody"}
              </button>
            ))}
          </div>
          <p className="combine">Or combine these options:</p>
          <label className="check">
            <input type="checkbox" checked={followers} onChange={(e) => toggle("followers", e.target.checked)} />
            Your followers
          </label>
          <label className="check">
            <input type="checkbox" checked={following} onChange={(e) => toggle("following", e.target.checked)} />
            People you follow
          </label>
          {who === "custom" && (
            <p className="hint">
              This photo has comment rules set in a Bluesky app. Saving here replaces them.
            </p>
          )}
          {state.status === "error" && (
            <p className="error" role="alert">
              {state.message} {state.login && <Link href="/login">Sign in</Link>}
            </p>
          )}
          <div className="dialog-actions">
            <button type="button" onClick={() => dialog.current?.close()}>
              Cancel
            </button>
            <button type="submit" className="primary" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
