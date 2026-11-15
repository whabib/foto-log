"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import type { WhoCanSign } from "@/lib/guestbook/entries";
import { type OwnerState, setWhoCanSignAction } from "./actions";

const LABELS = { everyone: "Everyone", following: "People I follow", nobody: "Nobody" } as const;

/** The owner's choice of who can sign this photo's guestbook. */
export default function WhoCanSignForm({ ownerDid, rkey, who }: { ownerDid: string; rkey: string; who: WhoCanSign }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<OwnerState, FormData>(
    async (prev, form) => {
      const result = await setWhoCanSignAction(ownerDid, rkey, prev, form);
      if (result.status === "done") router.refresh();
      return result;
    },
    { status: "idle" },
  );
  return (
    <form action={action} className="who-can-sign">
      <label htmlFor="who-can-sign">Who can sign</label>
      <select id="who-can-sign" name="who" defaultValue={who === "custom" ? "" : who} key={who}>
        {who === "custom" && (
          <option value="" disabled>
            Set in a Bluesky app
          </option>
        )}
        {Object.entries(LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
      {state.status === "error" && (
        <p className="error" role="alert">
          {state.message} {state.login && <Link href="/login">Sign in</Link>}
        </p>
      )}
    </form>
  );
}
