"use client";

import { useState } from "react";

/** Opens the system share sheet where there is one, otherwise copies the link. */
export default function ShareButton({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="link-button"
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ url, title });
          } catch {
            // Cancelled; nothing to do.
          }
          return;
        }
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", url);
        }
      }}
    >
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
