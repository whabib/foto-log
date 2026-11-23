import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin-server";
import { memberPath, photoKeyPath, thumbnailUrl } from "@/lib/photos/urls";
import { REPORT_ROWS, type PhotoViews, viewsByMember, viewsByPhoto } from "@/lib/views-server";

export const metadata: Metadata = { title: "Reports · Admin · foto-log" };

/** Views counted since this long ago make up the "last day" report. */
const DAY_MS = 24 * 60 * 60_000;

function memberLabel(m: { did: string; handle: string | null }): string {
  return m.handle ? `@${m.handle}` : m.did;
}

function PhotoTable({ rows, caption }: { rows: PhotoViews[]; caption: string }) {
  if (rows.length === 0) return <p className="muted">No views yet.</p>;
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Photo</th>
            <th scope="col">Member</th>
            <th scope="col">Date</th>
            <th scope="col" className="num">
              Views
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const owner = { did: p.did, handle: p.handle, name: p.name };
            return (
              <tr key={`${p.did}/${p.rkey}`} className={p.banned ? "banned" : undefined}>
                <td>
                  <Link href={photoKeyPath(owner, p.rkey)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="report-thumb" src={thumbnailUrl(p.did, p.imageCid)} alt="" width={48} height={48} />
                  </Link>
                </td>
                <td>
                  <Link href={memberPath(owner)}>{memberLabel(p)}</Link>
                  {p.banned && <span className="admin-banned">Banned</span>}
                </td>
                <td>
                  <Link href={photoKeyPath(owner, p.rkey)}>{p.rkey}</Link>
                </td>
                <td className="num">{p.views.toLocaleString("en-US")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Admin reports: photo views, all time and in the last day, and views by member. */
export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isAdmin(user.did))) notFound();

  // A server component renders once per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const since = new Date(Date.now() - DAY_MS);
  const [allTime, lastDay, members] = await Promise.all([viewsByPhoto(null), viewsByPhoto(since), viewsByMember()]);

  return (
    <main className="admin-page">
      <p>
        <Link href="/admin">‹ Admin</Link>
      </p>
      <h1>Reports</h1>
      <p className="muted">
        The top {REPORT_ROWS} of each. A view is a photo page or member page open in a browser for a couple of seconds,
        counted once per photo per browser tab; owners&rsquo; own visits don&rsquo;t count. Views are counted by the
        hour.
      </p>

      <h2>Views by photo</h2>
      <PhotoTable rows={allTime} caption="Views by photo, all time" />

      <h2>Views by photo, last 24 hours</h2>
      <PhotoTable rows={lastDay} caption="Views by photo in the last 24 hours" />

      <h2>Views by member</h2>
      {members.length === 0 ? (
        <p className="muted">No views yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col" className="num">
                  Photos viewed
                </th>
                <th scope="col" className="num">
                  Views
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.did} className={m.banned ? "banned" : undefined}>
                  <td>
                    <Link href={memberPath(m)}>{memberLabel(m)}</Link>
                    {m.banned && <span className="admin-banned">Banned</span>}
                  </td>
                  <td className="num">{m.photos.toLocaleString("en-US")}</td>
                  <td className="num">{m.views.toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
