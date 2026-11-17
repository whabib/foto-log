"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Moves on to `href` after a few seconds, for anyone who doesn't press Continue. */
export default function ContinueSoon({ href, seconds = 5 }: { href: string; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.replace(href), seconds * 1000);
    return () => clearTimeout(timer);
  }, [router, href, seconds]);
  return null;
}
