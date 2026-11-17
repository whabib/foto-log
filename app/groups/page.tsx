import type { Metadata } from "next";
import Link from "next/link";
import GroupBox from "@/app/components/groups/GroupBox";
import { getCurrentUser } from "@/lib/auth";
import { pageParam } from "@/lib/page-param";
import { timeAgo } from "@/lib/friends";
import { DIRECTORY_PAGE_SIZE, groupDirectory } from "@/lib/group-directory-server";
import { displayName, memberPath } from "@/lib/photos/urls";

export const metadata: Metadata = { title: "Groups · foto-log" };

/** Every group on foto-log, the most recently active first, with a way in or out of each. */
export default async function GroupsPage({ searchParams }: PageProps<"/groups">) {
  const { page: pageValue } = await searchParams;
  const page = pageParam(pageValue);
  const user = await getCurrentUser();
  const { groups, total } = await groupDirectory(page, user?.did ?? null);
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE));
  // A server component renders once per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <main className="groups-page">
      <h1>Groups</h1>
      <p className="muted">
        Groups are fotologs that members post to together. The most recently active are first.
      </p>
      {groups.length === 0 ? (
        <p className="muted">No groups yet.</p>
      ) : (
        <ul className="group-directory">
          {groups.map((g) => {
            const name = displayName(g);
            const href = memberPath(g);
            return (
              <li key={g.did} className="group-entry">
                <Link href={g.latest?.path ?? href} className="group-entry-photo" aria-label={`${name}'s newest photo`}>
                  {g.latest ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.latest.thumbnail} alt={g.latest.alt} loading="lazy" />
                  ) : g.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.avatar} alt="" loading="lazy" />
                  ) : (
                    <span className="group-entry-empty" aria-hidden="true" />
                  )}
                </Link>
                <div className="group-entry-body">
                  <h2 className="group-entry-name">
                    <Link href={href}>{name}</Link>
                  </h2>
                  {g.latest && <p className="group-entry-when">Newest photo {timeAgo(g.latest.createdAt, now)}</p>}
                  {g.description && <p className="group-entry-description">{g.description}</p>}
                  <GroupBox
                    groupDid={g.did}
                    members={g.members}
                    joinPolicy={g.joinPolicy}
                    viewer={g.viewer}
                    isOwner={user?.did === g.did}
                    signedIn={user !== null}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav className="admin-pages" aria-label="Pages">
          {page > 1 ? <Link href={`/groups?page=${page - 1}`}>Newer</Link> : <span />}
          <span className="muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={`/groups?page=${page + 1}`}>Older</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
