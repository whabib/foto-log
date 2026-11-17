"use client";

import { useActionState, useState } from "react";
import { confirmsDelete } from "@/lib/account-delete";
import { deleteAccountAction, type DeleteState } from "./actions";

/** Delete Account's form: whether to delete the repository records too, and typing the handle to confirm. */
export default function DeleteAccountForm({ handle, did }: { handle: string | null; did: string }) {
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, { status: "idle" });
  const [typed, setTyped] = useState("");
  const expected = handle ? `@${handle}` : did;
  const ready = confirmsDelete(typed, handle, did);

  return (
    <form className="settings-form" action={formAction}>
      <fieldset className="settings-fields" disabled={pending}>
        <label className="check-row">
          <input type="checkbox" name="deleteRecords" defaultChecked />
          Also delete my photos and friends from my Bluesky repository
        </label>
        <div className="field">
          <label htmlFor="confirm">
            To confirm, type <strong>{expected}</strong>
          </label>
          <input
            id="confirm"
            name="confirm"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </div>
        {state.status === "error" && (
          <p className="error" role="alert">
            {state.message}
          </p>
        )}
        <button type="submit" className="danger-button" disabled={!ready || pending}>
          {pending ? "Deleting…" : "Delete my foto-log"}
        </button>
      </fieldset>
    </form>
  );
}
