"use client";

import { useEffect, useRef, useState } from "react";

const ACCOUNT_COOKIE = "fotolog_account";
// Matches PAGE_ACCOUNT_HEADER in lib/auth.ts.
const PAGE_ACCOUNT_HEADER = "x-fotolog-account";

function cookieAccount(): string | null {
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (part.slice(0, eq) === ACCOUNT_COOKIE) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/**
 * Keeps a tab from acting as an account it wasn't shown for, after another
 * tab switched this browser to a different account.
 *
 * - Every request this page makes to foto-log (Server Actions and API
 *   calls) says which account the page was shown for; the server treats a
 *   mismatch as signed out, so even a save already under way can't write
 *   to the other account.
 * - When the tab comes back into view, or something is clicked or
 *   submitted, it checks for a switch and covers the page with a dialog
 *   until it's reloaded.
 */
export default function AccountWatcher({ did }: { did: string }) {
  const [switched, setSwitched] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      if (url.origin !== window.location.origin) return original(input, init);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set(PAGE_ACCOUNT_HEADER, did);
      return original(input, { ...init, headers });
    };
    return () => {
      window.fetch = original;
    };
  }, [did]);

  useEffect(() => {
    // Sessions from before multiple accounts have no cookie yet: nothing to compare.
    const isSwitched = () => {
      const current = cookieAccount();
      return current !== null && current !== did;
    };
    const check = () => {
      if (isSwitched()) setSwitched(true);
    };
    const beforeAct = (e: Event) => {
      if ((e.target as Element | null)?.closest?.("dialog.account-switched")) return;
      if (!isSwitched()) return;
      e.preventDefault();
      e.stopPropagation();
      setSwitched(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("submit", beforeAct, true);
    document.addEventListener("click", beforeAct, true);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("submit", beforeAct, true);
      document.removeEventListener("click", beforeAct, true);
    };
  }, [did]);

  // A modal dialog sits above everything (other open dialogs included) and keeps focus inside it.
  useEffect(() => {
    const d = dialog.current;
    if (switched && d && !d.open) d.showModal();
  }, [switched]);

  if (!switched) return null;
  return (
    <dialog
      ref={dialog}
      className="account-switched"
      aria-labelledby="account-switched-text"
      // Escape would leave the stale page usable; the only way out is Reload.
      onCancel={(e) => e.preventDefault()}
    >
      <p id="account-switched-text">You switched accounts in another tab. Reload this page to continue as that account.</p>
      <button type="button" onClick={() => window.location.reload()} autoFocus>
        Reload
      </button>
    </dialog>
  );
}
