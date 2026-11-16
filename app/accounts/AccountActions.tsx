"use client";

import { useEffect, useRef } from "react";

/** A row's action menu on the Switch accounts page. Built on <details>, like the account menu. */
export default function AccountActions({ did, label }: { did: string; label: string }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      const menu = ref.current;
      if (!menu?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        menu.open = false;
        menu.querySelector("summary")?.focus();
      } else if (!menu.contains(e.target as Node)) {
        menu.open = false;
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="account-actions">
      <summary aria-label={`Actions for ${label}`}>
        <span aria-hidden="true">&hellip;</span>
      </summary>
      <ul>
        <li>
          <form method="post" action="/accounts/logout">
            <input type="hidden" name="did" value={did} />
            <button type="submit">Log out of this account</button>
          </form>
        </li>
      </ul>
    </details>
  );
}
