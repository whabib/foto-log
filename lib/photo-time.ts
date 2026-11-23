import { isValidTimeZone } from "@/lib/photo-record";

/** The time zone's short name: "ET" or "PT" where there's a common one, else "GMT+1", "UTC" and the like. */
function zoneName(instant: Date, timeZone: string): string {
  const part = (style: "shortGeneric" | "short") =>
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: style })
      .formatToParts(instant)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  const generic = part("shortGeneric");
  // shortGeneric gives "ET" in the US but "Germany Time" elsewhere; keep only the short ones.
  return /^[A-Z]{1,5}$/.test(generic) ? generic : part("short");
}

/**
 * When a photo was posted, in the poster's own time zone, e.g.
 * "Nov 17, 2026, 11:57 AM ET". An unknown zone falls back to UTC.
 */
export function formatPhotoTime(iso: string, timeZone: string): string {
  const zone = isValidTimeZone(timeZone) ? timeZone : "UTC";
  const instant = new Date(iso);
  const text = instant.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: zone });
  return `${text} ${zoneName(instant, zone)}`;
}
