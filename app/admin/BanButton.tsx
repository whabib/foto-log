"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setBanned } from "./actions";

/** Ban or Unban for one member's row, after a confirmation. */
export default function BanButton({ did, label, banned }: { did: string; label: string; banned: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const click = () => {
    const question = banned
      ? `Lift the ban on ${label}? They'll be able to sign in again, and their page and photos will show again.`
      : `Ban ${label}? They'll be signed out and can't sign in again, and their page and photos are hidden from foto-log.`;
    if (!confirm(question)) return;
    setError(null);
    start(async () => {
      const result = await setBanned(did, !banned);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  };

  return (
    <>
      <button type="button" className={banned ? "admin-unban" : "admin-ban"} onClick={click} disabled={pending}>
        {pending ? (banned ? "Unbanning…" : "Banning…") : banned ? "Unban" : "Ban"}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {" "}
          {error}
        </span>
      )}
    </>
  );
}
