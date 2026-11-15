import Link from "next/link";
import { RichText } from "@atproto/api";
import LocalTime from "@/app/components/LocalTime";
import type { Guestbook as GuestbookData, GuestbookEntry } from "@/lib/guestbook/entries";
import { memberPath } from "@/lib/photos/urls";
import SignForm from "./SignForm";

/** An entry's text with its links made clickable. Only http(s) links are linked. */
function EntryText({ entry }: { entry: GuestbookEntry }) {
  const rt = new RichText({ text: entry.text, facets: entry.facets as never });
  return (
    <p className="entry-text">
      {Array.from(rt.segments()).map((seg, i) => {
        const uri = seg.link?.uri;
        if (uri && /^https?:\/\//i.test(uri)) {
          return (
            <a key={i} href={uri} rel="nofollow ugc noopener" target="_blank">
              {seg.text}
            </a>
          );
        }
        return seg.text;
      })}
    </p>
  );
}

export default function Guestbook({
  guestbook,
  ownerDid,
  rkey,
  bskyUrl,
  signedIn,
}: {
  guestbook: GuestbookData;
  ownerDid: string;
  rkey: string;
  bskyUrl: string | null;
  signedIn: boolean;
}) {
  const { entries, closed, count } = guestbook;
  return (
    <section className="guestbook" aria-labelledby="guestbook-heading">
      <h3 id="guestbook-heading" className="rail-heading">
        Guestbook Comments ({entries.length})
      </h3>
      {entries.length === 0 && <p className="rail-empty">No entries yet. Be the first to sign!</p>}
      <ol className="guestbook-entries">
        {entries.map((e) => (
          <li key={e.uri} className="entry">
            {e.author.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="entry-avatar" src={e.author.avatar} alt="" width={36} height={36} loading="lazy" />
            ) : (
              <span className="entry-avatar avatar-empty" aria-hidden="true" />
            )}
            <div className="entry-body">
              <p className="byline">
                <Link href={memberPath({ did: e.author.did, handle: e.author.handle })}>{e.author.handle}</Link>{" "}
                <span className="said">
                  said on <LocalTime iso={e.createdAt} />
                </span>
              </p>
              <EntryText entry={e} />
            </div>
          </li>
        ))}
      </ol>
      {count > entries.length && (
        <p className="rail-empty">
          More replies are on <a href={bskyUrl ?? "#"}>Bluesky</a>.
        </p>
      )}
      {closed ? (
        <p className="rail-empty">This guestbook is closed.</p>
      ) : signedIn ? (
        <SignForm ownerDid={ownerDid} rkey={rkey} />
      ) : (
        <p className="rail-empty">
          <Link href="/login">Sign in</Link> to sign the guestbook
          {bskyUrl && (
            <>
              , or <a href={bskyUrl}>reply on Bluesky</a>
            </>
          )}
          .
        </p>
      )}
    </section>
  );
}
