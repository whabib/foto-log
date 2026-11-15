"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

const FORMATS: Record<"datetime" | "time", Intl.DateTimeFormatOptions> = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  time: { timeStyle: "short" },
};

/** An instant shown in the viewer's own time zone. Empty during server rendering. */
export default function LocalTime({ iso, format = "datetime" }: { iso: string; format?: "datetime" | "time" }) {
  const text = useSyncExternalStore(
    noop,
    () => new Date(iso).toLocaleString(undefined, FORMATS[format]),
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
