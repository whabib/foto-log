"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * "Signed in as @handle" in the header, opening a menu of account links.
 * Built on <details> so it works before scripts load; the script closes it
 * on an outside click, Escape, or navigation.
 */
export default function AccountMenu({
  label,
  myPage,
  signOut,
}: {
  label: string;
  myPage: string;
  signOut: () => Promise<void>;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

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
    <details ref={ref} className="account-menu">
      <summary>
        <span className="signed-in-label">Signed in as </span>
        <strong>{label}</strong>
        <span className="caret" aria-hidden="true" />
      </summary>
      {/* Close after picking a link, even one to the page you're already on. */}
      <ul
        onClick={(e) => {
          if ((e.target as Element).closest("a") && ref.current) ref.current.open = false;
        }}
      >
        <li>
          <Link href={myPage}>My Page</Link>
        </li>
        <li>
          <Link href="/post">Upload a photo</Link>
        </li>
        <li>
          <Link href="/settings">Settings</Link>
        </li>
        <li>
          <form action={signOut}>
            <button type="submit">Logout</button>
          </form>
        </li>
      </ul>
    </details>
  );
}
