"use client";

import MemberImageField, { type ImageError, type PendingImage } from "./MemberImageField";

/** The member page wallpaper: an image, tiled or filling the window. */
export default function WallpaperField({
  current,
  pending,
  onChange,
  mode,
  onModeChange,
  disabled,
  error,
  background,
}: {
  current: string | null;
  pending: PendingImage;
  onChange: (change: PendingImage) => void;
  mode: "tile" | "fill";
  onModeChange: (mode: "tile" | "fill") => void;
  disabled?: boolean;
  error?: ImageError | null;
  background: string;
}) {
  const controls = (
    <fieldset className="wallpaper-mode" disabled={disabled}>
      <legend className="sr-only">How the wallpaper fills the page</legend>
      {(["tile", "fill"] as const).map((m) => (
        <label key={m}>
          <input
            type="radio"
            name="wallpaperModeChoice"
            value={m}
            checked={mode === m}
            onChange={() => onModeChange(m)}
          />
          {m === "tile" ? "Tile (repeat at its own size)" : "Fill (cover the window)"}
        </label>
      ))}
    </fieldset>
  );

  return (
    <MemberImageField
      field="wallpaper"
      label="Wallpaper"
      current={current}
      pending={pending}
      onChange={onChange}
      disabled={disabled}
      error={error}
      alt="Your wallpaper"
      background={background}
      previewClassName="wallpaper-preview"
      hint="Fills the page around your fotolog. Your page box keeps its background color, so your text stays readable."
      controls={controls}
      renderPreview={(url) => (
        <div
          className="wallpaper-sample"
          role="img"
          aria-label="Your wallpaper"
          style={{
            backgroundImage: `url("${url}")`,
            backgroundRepeat: mode === "fill" ? "no-repeat" : "repeat",
            backgroundSize: mode === "fill" ? "cover" : "auto",
            backgroundPosition: "center",
          }}
        >
          <span className="wallpaper-sample-box" style={{ backgroundColor: background }} />
        </div>
      )}
    />
  );
}
