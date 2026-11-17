"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The Settings pages; Group Management only for a group. */
export default function SettingsNav({ isGroup }: { isGroup: boolean }) {
  const pathname = usePathname();
  const pages = [
    { href: "/settings", label: "Profile" },
    ...(isGroup ? [{ href: "/settings/group", label: "Group Management" }] : []),
    { href: "/settings/customize", label: "Member Page Customization" },
  ];
  return (
    <nav className="settings-nav" aria-label="Settings">
      <ul>
        {pages.map((p) => (
          <li key={p.href}>
            <Link href={p.href} aria-current={pathname === p.href ? "page" : undefined}>
              {p.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
