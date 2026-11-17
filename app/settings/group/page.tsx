import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getGroup, groupMembers } from "@/lib/groups-server";
import { GroupManagement } from "../GroupSettings";

export const metadata: Metadata = { title: "Group Management · Settings · foto-log" };

/** Settings' Group Management page, for an account that's a group. */
export default async function GroupManagementPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const group = await getGroup(user.did);
  // Not a group (or not anymore): Profile is where that's turned on.
  if (!group) redirect("/settings#group");
  const members = await groupMembers(user.did);
  return (
    <section className="settings-section" aria-labelledby="group-heading">
      <h2 id="group-heading">Group Management</h2>
      <p className="muted">Who can join this group, requests waiting for you, and its members.</p>
      <GroupManagement
        joinPolicy={group.joinPolicy}
        members={members.map((m) => ({ did: m.did, handle: m.handle, name: m.name, status: m.status }))}
      />
    </section>
  );
}
