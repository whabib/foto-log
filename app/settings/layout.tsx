import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGroup } from "@/lib/groups-server";
import SettingsNav from "./SettingsNav";

/** Settings' pages, under one heading and a menu of them. */
export default async function SettingsLayout({ children }: LayoutProps<"/settings">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const group = await getGroup(user.did).catch(() => null);
  return (
    <main className="settings-page">
      <h1>Settings</h1>
      <SettingsNav isGroup={group !== null} />
      {children}
    </main>
  );
}
