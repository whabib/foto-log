import type { Metadata } from "next";
import Link from "next/link";
import FriendButton from "@/app/components/friends/FriendButton";
import { getCurrentUser } from "@/lib/auth";
import { listFriends } from "@/lib/friends-server";
import { timeAgo } from "@/lib/friends";
import { resolveActor } from "@/lib/identity";
import { MEMBER_DIRECTORY_PAGE_SIZE, memberDirectory, memberSortParam, type MemberSort } from "@/lib/member-directory-server";
import { pageParam } from "@/lib/page-param";
import { displayName, memberPath } from "@/lib/photos/urls";

export const metadata: Metadata = { title: "Member Directory · foto-log" };

function directoryHref(sort: MemberSort, page: number): string {
  const params = new URLSearchParams();
  if (sort !== "name") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/members?${query}` : "/members";
}

/** The viewer's Friends/Favorites, or an empty list if it can't be read. */
async function viewerFriends(did: string): Promise<Set<string>> {
  try {
    const actor = await resolveActor(did);
    return new Set(actor ? await listFriends(actor) : []);
  } catch {
    return new Set();
  }
}

/** Every member's fotolog (groups have their own directory), by name or by newest photo. */
export default async function MembersPage({ searchParams }: PageProps<"/members">) {
  const { page: pageValue, sort: sortValue } = await searchParams;
  const page = pageParam(pageValue);
  const sort = memberSortParam(sortValue);
  const user = await getCurrentUser();
  const [{ members, total }, friends] = await Promise.all([
    memberDirectory(page, sort),
    user ? viewerFriends(user.did) : Promise.resolve(new Set<string>()),
  ]);
  const pages = Math.max(1, Math.ceil(total / MEMBER_DIRECTORY_PAGE_SIZE));
  // A server component renders once per request, so reading the clock here is fine.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  return (
    <main className="groups-page">
      <h1>Member Directory</h1>
      <p className="muted">Everyone with a fotolog on foto-log.</p>
      <nav className="directory-sort" aria-label="Sort">
        Sort by:{" "}
        {sort === "name" ? <strong aria-current="page">Name</strong> : <Link href={directoryHref("name", 1)}>Name</Link>}
        {" · "}
        {sort === "recent" ? (
          <strong aria-current="page">Most recently updated</strong>
        ) : (
          <Link href={directoryHref("recent", 1)}>Most recently updated</Link>
        )}
      </nav>
      {members.length === 0 ? (
        <p className="muted">No members yet.</p>
      ) : (
        <ul className="group-directory">
          {members.map((m) => {
            const name = displayName(m);
            const href = memberPath(m);
            return (
              <li key={m.did} className="group-entry">
                <Link href={m.latest?.path ?? href} className="group-entry-photo" aria-label={`${name}'s newest photo`}>
                  {m.latest ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.latest.thumbnail} alt={m.latest.alt} loading="lazy" />
                  ) : (
                    <span className="group-entry-empty" aria-hidden="true" />
                  )}
                </Link>
                <div className="group-entry-body">
                  <h2 className="group-entry-name member-entry-name">
                    {m.avatar && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.avatar} alt="" className="member-entry-avatar" loading="lazy" />
                    )}
                    <Link href={href}>{name}</Link>
                  </h2>
                  {m.latest ? (
                    <p className="group-entry-when">Newest photo {timeAgo(m.latest.createdAt, now)}</p>
                  ) : (
                    <p className="group-entry-when">No photos yet</p>
                  )}
                  {m.location && <p className="group-entry-location">{m.location}</p>}
                  {user?.did === m.did ? (
                    <p className="friend-toggle">That&apos;s you!</p>
                  ) : (
                    user && <FriendButton did={m.did} onList={friends.has(m.did)} handle={m.handle} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {pages > 1 && (
        <nav className="admin-pages" aria-label="Pages">
          {page > 1 ? <Link href={directoryHref(sort, page - 1)}>Previous</Link> : <span />}
          <span className="muted">
            Page {page} of {pages}
          </span>
          {page < pages ? <Link href={directoryHref(sort, page + 1)}>Next</Link> : <span />}
        </nav>
      )}
    </main>
  );
}
