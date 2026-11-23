"use client";

import { useEffect } from "react";

/** How long the page must be open (and visible) before the view is sent; the server requires 2 seconds. */
const SEND_AFTER_MS = 2_500;

/**
 * Counts one view of the photo on this page. Sends the page's view token
 * once the page has been visible for a moment, and only once per photo
 * per browser tab, so reloading doesn't count again.
 */
export default function ViewBeacon({ photo, token }: { photo: string; token: string }) {
  useEffect(() => {
    const key = `foto-log:viewed:${photo}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {
      // No sessionStorage (private mode, blocked storage): count without de-duplicating.
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sent = false;
    const send = () => {
      sent = true;
      try {
        sessionStorage.setItem(key, "1");
      } catch {
        // See above.
      }
      void fetch("/api/views", { method: "POST", body: token, keepalive: true, credentials: "same-origin" }).catch(
        () => {},
      );
    };
    const start = () => {
      if (sent || timer || document.visibilityState !== "visible") return;
      timer = setTimeout(send, SEND_AFTER_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
      } else if (timer && !sent) {
        // Hidden before the delay passed: start over when it's visible again.
        clearTimeout(timer);
        timer = undefined;
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [photo, token]);
  return null;
}
