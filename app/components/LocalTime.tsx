"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

const FORMATS: Record<"datetime" | "time", Intl.DateTimeFormatOptions> = {
  datetime: { dateStyle: "medium", timeStyle: "short" },
  time: { timeStyle: "short" },
};

/**
 * An instant shown in the viewer's own time zone. Empty during server
 * rendering, and so is `lead`, text such as ", " that goes before it.
 */
export default function LocalTime({
  iso,
  format = "datetime",
  lead = "",
}: {
  iso: string;
  format?: "datetime" | "time";
  lead?: string;
}) {
  const text = useSyncExternalStore(
    noop,
    () => new Date(iso).toLocaleString(undefined, FORMATS[format]),
    () => "",
  );
  return (
    <>
      {text && lead}
      <time dateTime={iso}>{text}</time>
    </>
  );
}
