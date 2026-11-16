"use client";

import { startTransition, useActionState, useState } from "react";
import { regionLabel, regionOptions } from "@/lib/geo";
import { type SaveState, saveSettings } from "./actions";
import FotologNameField from "./FotologNameField";
import { useLeaveWarning } from "./useLeaveWarning";

type Values = { country: string; region: string; locality: string };

/** The Profile page's form: the member's name and where they are. */
export default function ProfileForm({
  initial,
  countries,
  identity,
}: {
  initial: Values;
  countries: { code: string; name: string }[];
  /** The member's Fotolog name and Bluesky handle, and which one they're shown by. */
  identity: { name: string | null; handle: string | null; primary: "fotolog" | "bluesky" };
}) {
  const [values, setValues] = useState<Values>(initial);
  const [saved, setSaved] = useState<Values>(initial);
  const [primary, setPrimary] = useState(identity.primary);
  // Setting a name makes it primary; follow the saved choice when it changes.
  const [savedPrimary, setSavedPrimary] = useState(identity.primary);
  if (savedPrimary !== identity.primary) {
    setSavedPrimary(identity.primary);
    setPrimary(identity.primary);
  }
  const [state, formAction, pending] = useActionState<SaveState, FormData>(async (prev, data) => {
    const result = await saveSettings(prev, data);
    if (result.status === "saved") {
      setSaved({ ...values });
      setSavedPrimary(primary);
    }
    return result;
  }, { status: "idle" });
  const set = (field: keyof Values) => (v: string) =>
    setValues((prev) => ({
      ...prev,
      [field]: v,
      // Region codes belong to one country; clear it when the country changes.
      ...(field === "country" ? { region: "" } : {}),
    }));
  const errors = state.status === "error" ? state.errors : {};
  const dirty = (Object.keys(values) as (keyof Values)[]).some((k) => values[k] !== saved[k]) || primary !== savedPrimary;
  useLeaveWarning(dirty);

  const regions = regionOptions(values.country);
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        // Submit via the action without React's automatic form reset, which
        // would visually reset the controlled <select>s after saving.
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      <input type="hidden" name="section" value="profile" />
      <fieldset className="settings-fields" disabled={pending}>
        <FotologNameField
          name={identity.name}
          handle={identity.handle}
          primary={primary}
          onPrimaryChange={setPrimary}
          disabled={pending}
        />
        <fieldset className="field">
          <legend>Location</legend>
          <label htmlFor="country">Country</label>
          <select id="country" name="country" value={values.country} onChange={(e) => set("country")(e.target.value)}>
            <option value="">Not shown</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.country && <p className="field-error">{errors.country}</p>}

          {values.country && (
            <>
              <label htmlFor="region">
                {regionLabel(values.country)}
                {!regions && <span className="optional"> (optional)</span>}
              </label>
              {regions ? (
                <select id="region" name="region" value={values.region} onChange={(e) => set("region")(e.target.value)}>
                  <option value="">Not shown</option>
                  {regions.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input id="region" name="region" type="text" value={values.region} onChange={(e) => set("region")(e.target.value)} />
              )}
              {errors.region && <p className="field-error">{errors.region}</p>}

              <label htmlFor="locality">
                City or town <span className="optional">(optional)</span>
              </label>
              <input
                id="locality"
                name="locality"
                type="text"
                value={values.locality}
                onChange={(e) => set("locality")(e.target.value)}
              />
              {errors.locality && <p className="field-error">{errors.locality}</p>}
            </>
          )}
        </fieldset>
        {state.status === "error" && state.message && (
          <p className="error" role="alert">
            {state.message}
          </p>
        )}
        {state.status === "saved" && !dirty && (
          <p className="notice-inline" role="status">
            Saved.
          </p>
        )}
        <button type="submit">{pending ? "Saving…" : "Save"}</button>
      </fieldset>
    </form>
  );
}
