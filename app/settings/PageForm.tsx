"use client";

import { startTransition, useActionState, useState } from "react";
import { contrastRatio, isHexColor, MIN_CONTRAST } from "@/lib/member-settings";
import { resetSettings, type SaveState, saveSettings } from "./actions";
import { useRouter } from "next/navigation";
import MemberImageField, { type ImageError, NO_CHANGE, type PendingImage, saveImageChange } from "./MemberImageField";
import { useLeaveWarning } from "./useLeaveWarning";
import WallpaperField from "./WallpaperField";

type Values = {
  title: string;
  backgroundColor: string;
  textColor: string;
  linkColor: string;
};

type Props = {
  initial: Values;
  defaults: { title: string; backgroundColor: string; textColor: string };
  /** The member's location as their page shows it, for the preview. */
  location: string | null;
  hasSaved: boolean;
  /** The member's own page, shown after a successful save. */
  memberPage: string;
  /** Saved page images; undefined if they couldn't be loaded. */
  images?: { titleImage: string | null; wallpaper: string | null; wallpaperMode: "tile" | "fill" };
};

function ColorField({
  id,
  label,
  value,
  fallback,
  error,
  onChange,
}: {
  id: "backgroundColor" | "textColor" | "linkColor";
  label: string;
  value: string;
  fallback: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const shown = isHexColor(value) ? value.toLowerCase() : fallback;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="color-row">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={shown}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={id}
          name={id}
          type="text"
          inputMode="text"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={7}
          placeholder={fallback}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={Boolean(error) || (value !== "" && !isHexColor(value))}
        />
      </div>
      {(error || (value !== "" && !isHexColor(value))) && (
        <p className="field-error">{error ?? "Use a hex color like #1a1a1a."}</p>
      )}
    </div>
  );
}

/** The Member Page Customization page's form: title, title image, colors and wallpaper. */
export default function PageForm({ initial, defaults, location, hasSaved, memberPage, images }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(initial);
  // Image changes wait here until Save, like the rest of the form.
  const [titleImage, setTitleImage] = useState<PendingImage>(NO_CHANGE);
  const [wallpaper, setWallpaper] = useState<PendingImage>(NO_CHANGE);
  const [wallpaperMode, setWallpaperMode] = useState(images?.wallpaperMode ?? "tile");
  const [imageErrors, setImageErrors] = useState<{ titleImage?: ImageError; wallpaper?: ImageError }>({});
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async (prev, data) => {
      const result = await saveSettings(prev, data);
      if (result.status !== "saved") return result;
      if (!images) {
        router.push(memberPage);
        return result;
      }
      // Then the images, each separately, so one failing doesn't undo the others.
      const errors: typeof imageErrors = {};
      if (titleImage.kind !== "none") {
        const err = await saveImageChange("titleImage", titleImage);
        if (err) errors.titleImage = err;
        else setTitleImage(NO_CHANGE);
      }
      const modeChanged = wallpaperMode !== images.wallpaperMode;
      if (wallpaper.kind !== "none" || modeChanged) {
        const mode = modeChanged || wallpaper.kind === "set" ? wallpaperMode : undefined;
        const err = await saveImageChange("wallpaper", wallpaper, mode);
        if (err) errors.wallpaper = err;
        else setWallpaper(NO_CHANGE);
      }
      setImageErrors(errors);
      if (Object.keys(errors).length) {
        router.refresh();
        return { status: "error", errors: {}, message: "Your settings were saved, but an image wasn't. See above." };
      }
      // Everything saved: show the member their page.
      router.push(memberPage);
      return result;
    },
    { status: "idle" },
  );
  const set = (field: keyof Values) => (v: string) => setValues((prev) => ({ ...prev, [field]: v }));
  const errors = state.status === "error" ? state.errors : {};

  const dirty =
    (Object.keys(values) as (keyof Values)[]).some((k) => values[k] !== initial[k]) ||
    titleImage.kind !== "none" ||
    wallpaper.kind !== "none" ||
    (images !== undefined && wallpaperMode !== images.wallpaperMode);
  // Stays on while saving; the redirect after a save is programmatic, so it isn't asked about.
  useLeaveWarning(dirty);

  const bg = isHexColor(values.backgroundColor) ? values.backgroundColor : defaults.backgroundColor;
  const fg = isHexColor(values.textColor) ? values.textColor : defaults.textColor;
  // Blank link color means "same as the text".
  const link = isHexColor(values.linkColor) ? values.linkColor : fg;
  const ratio = contrastRatio(bg, fg);
  const linkRatio = contrastRatio(bg, link);
  const previewLocation = location;

  const status =
    state.status === "error" && state.message ? (
      <p className="error" role="alert">
        {state.message}
      </p>
    ) : state.status === "saved" ? (
      <p className="notice-inline" role="status">
        Saved.
      </p>
    ) : null;

  return (
    <>
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
        {/* Locked while saving, so no edit is made after the values were sent. */}
        <fieldset className="settings-fields" disabled={pending}>
          <input type="hidden" name="section" value="page" />
          <section className="settings-section">
            <div className="field">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                name="title"
                type="text"
                value={values.title}
                placeholder={defaults.title}
                onChange={(e) => set("title")(e.target.value)}
              />
              <p className="hint">Leave blank to use &ldquo;{defaults.title}&rdquo;.</p>
              {errors.title && <p className="field-error">{errors.title}</p>}
            </div>

            {images && (
              <MemberImageField
                field="titleImage"
                label="Title Image"
                current={images.titleImage}
                pending={titleImage}
                onChange={setTitleImage}
                disabled={pending}
                error={imageErrors.titleImage}
                alt={values.title.trim() || defaults.title}
                background={bg}
                previewClassName="title-image-preview"
                hint="Your title will be used as the alt text for the image. It replaces the text title across the top of your page. Wide images work best, like 738×60, shown up to 150px tall."
              />
            )}


            <ColorField
              id="backgroundColor"
              label="Background color"
              value={values.backgroundColor}
              fallback={defaults.backgroundColor}
              error={errors.backgroundColor}
              onChange={set("backgroundColor")}
            />
            <ColorField
              id="textColor"
              label="Text color"
              value={values.textColor}
              fallback={defaults.textColor}
              error={errors.textColor}
              onChange={set("textColor")}
            />
            <ColorField
              id="linkColor"
              label="Link color"
              value={values.linkColor}
              fallback={fg}
              error={errors.linkColor}
              onChange={set("linkColor")}
            />
            <p className="hint">Leave the link color blank to match the text. Links show in the text color when hovered.</p>

            <div className="field">
              <span className="label">Preview</span>
              <div className="member-preview" style={{ backgroundColor: bg, color: fg }}>
                <strong>{values.title.trim() || defaults.title}</strong>
                {previewLocation && <span>{previewLocation}</span>}
                <span style={{ color: link, textDecoration: "underline" }}>A link</span>
              </div>
              {Math.min(ratio, linkRatio) < MIN_CONTRAST && (
                <p className="warning" role="status">
                  These colors may be hard to read (contrast {Math.min(ratio, linkRatio).toFixed(1)}:1; at least {MIN_CONTRAST}:1 is
                  recommended). You can still save them.
                </p>
              )}
            </div>

            {images && (
              <WallpaperField
                current={images.wallpaper}
                pending={wallpaper}
                onChange={setWallpaper}
                mode={wallpaperMode}
                onModeChange={setWallpaperMode}
                disabled={pending}
                error={imageErrors.wallpaper}
                background={bg}
              />
            )}

            {status}
            <button type="submit">{pending ? "Saving…" : "Save"}</button>
          </section>
        </fieldset>
      </form>

      {hasSaved && (
        <form
          action={resetSettings}
          className="reset-form"
          onSubmit={(e) => {
            if (!confirm("Reset your member page to the default title and colors?")) {
              e.preventDefault();
            }
          }}
        >
          <button type="submit" className="link-button">
            Reset to defaults
          </button>
        </form>
      )}
    </>
  );
}
