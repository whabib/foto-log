"use client";

import { useFormStatus } from "react-dom";
import { deletePhotoAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="link-button" disabled={pending}>
      {pending ? "Deleting…" : "Delete photo"}
    </button>
  );
}

/** "Delete photo" at the right end of the links under the owner's photo, with a confirmation. */
export default function DeleteButton({ rkey }: { rkey: string }) {
  return (
    <form
      className="photo-delete"
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
