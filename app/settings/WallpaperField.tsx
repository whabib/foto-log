"use client";

import { useState } from "react";
import MemberImageField, { useImageSender } from "./MemberImageField";

/** The member page wallpaper: an image, tiled or filling the window. */
export default function WallpaperField({
  current,
  mode,
  background,
}: {
  current: string | null;
  mode: "tile" | "fill";
  background: string;
}) {
  const [chosen, setChosen] = useState(mode);
  const modeSender = useImageSender("wallpaper");

  const controls = (
    <fieldset className="wallpaper-mode" disabled={modeSender.status.kind === "busy"}>
      <legend className="sr-only">How the wallpaper fills the page</legend>
      {(["tile", "fill"] as const).map((m) => (
        <label key={m}>
          <input
            type="radio"
            name="wallpaperModeChoice"
            value={m}
            checked={chosen === m}
            onChange={async () => {
              const before = chosen;
              setChosen(m);
              // With a saved wallpaper, switching applies right away.
              if (current && !(await modeSender.send({ wallpaperMode: m }))) setChosen(before);
            }}
          />
          {m === "tile" ? "Tile (repeat at its own size)" : "Fill (cover the window)"}
        </label>
      ))}
      {modeSender.status.kind === "error" && <span className="field-error">{modeSender.status.message}</span>}
    </fieldset>
  );

  return (
    <MemberImageField
      field="wallpaper"
      label="Wallpaper"
      current={current}
      alt="Your wallpaper"
      background={background}
      previewClassName={chosen === "fill" ? "wallpaper-preview fill" : "wallpaper-preview"}
      hint="Fills the page around your fotolog. Your page box keeps its background color, so your text stays readable."
      extra={{ request: { wallpaperMode: chosen }, controls }}
      renderPreview={(url) => (
        <div
          className="wallpaper-sample"
          role="img"
          aria-label="Your wallpaper"
          style={{
            backgroundImage: `url("${url}")`,
            backgroundRepeat: chosen === "fill" ? "no-repeat" : "repeat",
            backgroundSize: chosen === "fill" ? "cover" : "auto",
            backgroundPosition: "center",
          }}
        >
          <span className="wallpaper-sample-box" style={{ backgroundColor: background }} />
        </div>
      )}
    />
  );
}
