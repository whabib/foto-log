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
  // One sender for uploads and mode changes, so they can't overlap.
  const sender = useImageSender("wallpaper");

  const controls = (
    <fieldset className="wallpaper-mode" disabled={sender.status.kind === "busy"}>
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
              if (current && !(await sender.send({ wallpaperMode: m }))) setChosen(before);
            }}
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
      alt="Your wallpaper"
      background={background}
      previewClassName={chosen === "fill" ? "wallpaper-preview fill" : "wallpaper-preview"}
      hint="Fills the page around your fotolog. Your page box keeps its background color, so your text stays readable."
      extra={{ request: { wallpaperMode: chosen }, controls }}
      sender={sender}
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
