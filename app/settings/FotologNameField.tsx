"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { NAME_MAX, NAME_MIN, nameProblem, normalizeName } from "@/lib/fotolog-name";
import { checkFotologName, claimFotologName } from "./actions";

type Props = {
  /** The member's Fotolog name, once set. */
  name: string | null;
  handle: string | null;
  /** Which name the member is shown by; part of the settings form's Save. */
  primary: "fotolog" | "bluesky";
  onPrimaryChange: (p: "fotolog" | "bluesky") => void;
  disabled?: boolean;
};

type Check = { name: string; message: string; ok: boolean } | null;

/**
 * The member's Fotolog name. Before it's set: a box with a live check and a
 * Set button, which saves it at once since it can only be done once. After:
 * the choice of showing it or the Bluesky handle, saved with the form.
 */
export default function FotologNameField({ name, handle, primary, onPrimaryChange, disabled }: Props) {
  if (name) {
    return (
      <fieldset className="field">
        <legend>Fotolog name</legend>
        <p className="fotolog-name">{name}</p>
        <p className="hint">Your Fotolog name can&rsquo;t be changed. Choose which name people see:</p>
        <label className="radio">
          <input
            type="radio"
            name="primaryName"
            value="fotolog"
            checked={primary === "fotolog"}
            onChange={() => onPrimaryChange("fotolog")}
          />
          {name} <span className="optional">(Fotolog name)</span>
        </label>
        <label className="radio">
          <input
            type="radio"
            name="primaryName"
            value="bluesky"
            checked={primary === "bluesky"}
            onChange={() => onPrimaryChange("bluesky")}
          />
          {handle ? `@${handle}` : "Your Bluesky handle"} <span className="optional">(Bluesky handle)</span>
        </label>
        <p className="hint">Links to either name keep working and lead to the one you choose.</p>
      </fieldset>
    );
  }
  return <NameClaim handle={handle} disabled={disabled} />;
}

function NameClaim({ handle, disabled }: { handle: string | null; disabled?: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [check, setCheck] = useState<Check>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const normalized = normalizeName(input);
  const problem = normalized ? nameProblem(normalized) : null;

  // Ask the server whether a well-formed name is free, once typing pauses.
  useEffect(() => {
    if (!normalized || problem) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const result = await checkFotologName(normalized).catch(() => null);
      if (stale || !result) return;
      setCheck(result.ok ? { name: normalized, ok: true, message: "Available." } : { name: normalized, ok: false, message: result.message });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [normalized, problem]);

  const checked = check?.name === normalized ? check : null;
  const message = error ?? problem ?? checked?.message ?? null;
  // A failed attempt shows its error but can be tried again as is.
  const ok = !problem && checked?.ok === true;

  const claim = () => {
    if (!ok) return;
    const warning =
      `Set your Fotolog name to "${normalized}"?\n\n` +
      "You can only set it once, and it can never be changed or given up. " +
      "It becomes your address on foto-log (foto-log.com/@" + normalized + ") and is shown instead of your Bluesky handle. " +
      "You can switch back to showing your Bluesky handle at any time.";
    if (!confirm(warning)) return;
    setError(null);
    startSaving(async () => {
      const result = await claimFotologName(normalized);
      if (result.ok) router.refresh();
      else setError(result.message);
    });
  };

  return (
    <div className="field">
      <label htmlFor="fotologName">Fotolog name</label>
      <p className="hint">
        Pick a one-word name to use on foto-log instead of {handle ? `@${handle}` : "your Bluesky handle"}. Use{" "}
        {NAME_MIN} to {NAME_MAX} letters, numbers and underscores. You can only set it once.
      </p>
      <div className="name-row">
        {/* No name attribute: it's set with its own button, not with the form's Save. */}
        <input
          id="fotologName"
          type="text"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={NAME_MAX + 1}
          value={input}
          disabled={disabled || saving}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            // Enter here shouldn't submit the rest of the settings.
            if (e.key === "Enter") {
              e.preventDefault();
              claim();
            }
          }}
          aria-invalid={Boolean(error || problem || (checked && !checked.ok))}
          aria-describedby="fotologName-status"
        />
        <button type="button" onClick={claim} disabled={disabled || saving || !ok}>
          {saving ? "Setting…" : "Set name"}
        </button>
      </div>
      <p id="fotologName-status" className={ok && !error ? "notice-inline" : "field-error"} role="status">
        {message}
      </p>
    </div>
  );
}
