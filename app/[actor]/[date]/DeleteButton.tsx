"use client";

import { useFormStatus } from "react-dom";
import { deletePhotoAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="danger" disabled={pending}>
      {pending ? "Deleting…" : "Delete this photo"}
    </button>
  );
}

export default function DeleteButton({ rkey }: { rkey: string }) {
  return (
    <form
      action={deletePhotoAction.bind(null, rkey)}
      onSubmit={(e) => {
        if (!confirm("Delete this photo? This also deletes its post on Bluesky. This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <Submit />
    </form>
  );
}
