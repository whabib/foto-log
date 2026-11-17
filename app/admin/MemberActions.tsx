"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { changeMember, type MemberChange } from "./actions";

type Props = {
  did: string;
  /** How the member is named in the confirmations. */
  label: string;
  banned: boolean;
  admin: "built-in" | "made" | null;
};

const QUESTIONS: Record<MemberChange, (label: string) => string> = {
  ban: (l) =>
    `Ban ${l}? They'll be signed out and can't sign in again, and their page and photos are hidden from foto-log.`,
  unban: (l) => `Lift the ban on ${l}? They'll be able to sign in again, and their page and photos will show again.`,
  "make-admin": (l) => `Make ${l} an admin? They'll be able to see this page, ban members and make other admins.`,
  "remove-admin": (l) => `Remove ${l} as an admin?`,
};

const LABELS: Record<MemberChange, [string, string]> = {
  ban: ["Ban", "Banning…"],
  unban: ["Unban", "Unbanning…"],
  "make-admin": ["Make admin", "Making admin…"],
  "remove-admin": ["Remove admin", "Removing…"],
};

/** The admin page's buttons for one member, each asking before it acts. */
export default function MemberActions({ did, label, banned, admin }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<MemberChange | null>(null);
  const [pending, start] = useTransition();

  // Admins can't be banned, and banned members can't be made admins.
  const changes: MemberChange[] = banned
    ? ["unban"]
    : admin === "made"
      ? ["remove-admin"]
      : admin === "built-in"
        ? []
        : ["make-admin", "ban"];

  const run = (change: MemberChange) => {
    if (!confirm(QUESTIONS[change](label))) return;
    setError(null);
    setRunning(change);
    start(async () => {
      const result = await changeMember(did, change);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  };

  return (
    <span className="admin-actions">
      {changes.map((c) => (
        <button key={c} type="button" className={c === "ban" ? "admin-ban" : undefined} onClick={() => run(c)} disabled={pending}>
          {pending && running === c ? LABELS[c][1] : LABELS[c][0]}
        </button>
      ))}
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
