"use client";

import { useEffect, useState } from "react";

const ACCOUNT_COOKIE = "fotolog_account";

function cookieAccount(): string | null {
  for (const part of document.cookie.split("; ")) {
    const eq = part.indexOf("=");
    if (part.slice(0, eq) === ACCOUNT_COOKIE) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/**
 * Notices when another tab switched this browser to a different account,
 * and covers the page until it's reloaded, so nothing here is posted,
 * saved or signed as the wrong account. Checks when the tab comes back
 * into view and before any form is submitted or button pressed.
 */
export default function AccountWatcher({ did }: { did: string }) {
  const [switched, setSwitched] = useState(false);

  useEffect(() => {
    // Sessions from before multiple accounts have no cookie yet: nothing to compare.
    const isSwitched = () => {
      const current = cookieAccount();
      return current !== null && current !== did;
    };
    const check = () => {
      if (isSwitched()) setSwitched(true);
    };
    // Some actions run from a button's click rather than a form submit.
    const beforeAct = (e: Event) => {
      if ((e.target as Element | null)?.closest?.(".account-switched")) return;
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

  if (!switched) return null;
  return (
    <div className="account-switched" role="alertdialog" aria-modal="true" aria-labelledby="account-switched-text">
      <div>
        <p id="account-switched-text">
          You switched accounts in another tab. Reload this page to continue as that account.
        </p>
        <button type="button" onClick={() => window.location.reload()} autoFocus>
          Reload
        </button>
      </div>
    </div>
  );
}
