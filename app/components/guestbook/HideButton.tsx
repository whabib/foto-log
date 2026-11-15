"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hideEntryAction } from "./actions";

/** The owner's "Hide" link on a guestbook entry. */
export default function HideButton({ ownerDid, rkey, entryUri }: { ownerDid: string; rkey: string; entryUri: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="link-button entry-hide"
        disabled={pending}
        title="Hide this entry here and in Bluesky apps"
        onClick={() =>
          start(async () => {
            const result = await hideEntryAction(ownerDid, rkey, entryUri);
            if (result.status === "error") setError(result.message);
            else router.refresh();
          })
        }
      >
        {pending ? "Hiding…" : "Hide"}
      </button>
      {error && (
        <span className="error" role="alert">
          {" "}
          {error}
        </span>
      )}
    </>
  );
}
