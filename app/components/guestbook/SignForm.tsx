"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { signGuestbookAction, type SignState } from "./actions";

const MAX = 300;
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const length = (s: string) => Array.from(segmenter.segment(s.trim())).length;

export default function SignForm({ ownerDid, rkey }: { ownerDid: string; rkey: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<SignState, FormData>(
    async (prev, form) => {
      const result = await signGuestbookAction(ownerDid, rkey, prev, form);
      if (result.status === "signed") {
        setText("");
        // Show the new entry.
        router.refresh();
      }
      return result;
    },
    { status: "idle" },
  );
  const used = length(text);
  return (
    <form action={action} className="guestbook-form">
      <label htmlFor="guestbook-text">Sign the guestbook</label>
      <textarea
        id="guestbook-text"
        name="text"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        required
      />
      <div className="guestbook-form-row">
        <span className={used > MAX ? "counter over" : "counter"}>
          {used}/{MAX}
        </span>
        <button type="submit" disabled={pending || used === 0 || used > MAX}>
          {pending ? "Signing…" : "Sign"}
        </button>
      </div>
      <p className="hint">Your entry is posted as a reply from your Bluesky account.</p>
      {state.status === "error" && (
        <p className="error" role="alert">
          {state.message} {state.login && <Link href="/login">Sign in</Link>}
        </p>
      )}
      {state.status === "signed" && (
        <p className="notice-inline" role="status">
          Thanks for signing!
        </p>
      )}
    </form>
  );
}
