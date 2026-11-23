import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pageParam } from "@/lib/page-param";
import { ADMIN_PAGE_SIZE, adminMembers, isAdmin } from "@/lib/admin-server";
import { memberPath } from "@/lib/photos/urls";
import MemberActions from "./MemberActions";

export const metadata: Metadata = { title: "Admin · foto-log" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** The admin tool: every member, for admins only. */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Anyone else sees no admin page at all.
  if (!(await isAdmin(user.did))) notFound();

  const { page: pageValue } = await searchParams;
  const page = pageParam(pageValue);
  const { rows, total } = await adminMembers(page);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));

  return (
    <main className="admin-page">
      <h1>Admin</h1>
      <p>
        <Link href="/admin/reports">Reports</Link>: photo views by photo and by member.
      </p>
      <h2>Members</h2>
      <p className="muted">
        {total} {total === 1 ? "member" : "members"}, newest first. Dates and times are in UTC.
      </p>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Member</th>
              <th scope="col">Fotolog name</th>
              <th scope="col">Signed up</th>
              <th scope="col" className="num">
                Photos
              </th>
              <th scope="col" className="num">
                Following
              </th>
              <th scope="col">Group</th>
              <th scope="col" className="num">
                Group members
              </th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const name = m.showFotologName ? m.fotologName : null;
              const label = m.handle ? `@${m.handle}` : m.did;
              return (
                <tr key={m.did} className={m.banned ? "banned" : undefined}>
                  <td>
                    <Link href={memberPath({ did: m.did, handle: m.handle, name })}>
                      {label}
                    </Link>
                  </td>
                  <td>{m.fotologName ?? ""}</td>
                  <td>{dateFormat.format(m.joinedAt)}</td>
                  <td className="num">{m.photos}</td>
                  <td className="num">{m.following ?? "?"}</td>
                  <td>{m.groupMembers !== null ? "Yes" : ""}</td>
                  <td className="num">{m.groupMembers ?? ""}</td>
                  <td className="admin-status">
                    {m.banned && <span className="admin-banned">Banned</span>}
                    {m.ban && (
                      <span className="admin-ban-detail">
                        {dateTimeFormat.format(m.ban.at)} by {m.ban.byHandle ? `@${m.ban.byHandle}` : m.ban.by}
                        {m.ban.reason && <>: &ldquo;{m.ban.reason}&rdquo;</>}
                      </span>
                    )}
                    {m.admin && <span className="admin-role">{m.admin === "built-in" ? "Admin (built in)" : "Admin"}</span>}
                  </td>
                  <td>
                    {m.did !== user.did && (
                      <MemberActions did={m.did} label={label} banned={m.banned} admin={m.admin} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="admin-pages" aria-label="Pages">
          {page > 1 ? <Link href={`/admin?page=${page - 1}`}>Newer</Link> : <span />}
          <span className="muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`/admin?page=${page + 1}`}>Older</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
