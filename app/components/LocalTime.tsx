"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** An instant shown in the viewer's own time zone. Empty during server rendering. */
export default function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    noop,
    () => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
