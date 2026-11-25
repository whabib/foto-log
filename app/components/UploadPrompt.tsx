"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * "Upload your photo of the day!" in the header, shown only once we know the
 * signed-in member hasn't posted today in their own time zone. Checks again
 * on each navigation until they have, so it goes away after posting.
 */
export default function UploadPrompt() {
  const pathname = usePathname();
  const [posted, setPosted] = useState<boolean | null>(null);

  useEffect(() => {
    if (posted) return;
    let cancelled = false;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fetch(`/api/photos/today?tz=${encodeURIComponent(timeZone)}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((d: { path?: string | null } | null) => {
        // An error or unknown answer hides the link rather than nagging.
        if (!cancelled) setPosted(d ? Boolean(d.path) : true);
      })
      .catch(() => !cancelled && setPosted(true));
    return () => {
      cancelled = true;
    };
  }, [pathname, posted]);

  if (posted !== false || pathname === "/post") return null;
  return (
    <Link href="/post" className="upload-prompt">
      Upload your photo of the day!
    </Link>
  );
}
