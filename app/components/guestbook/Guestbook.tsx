import Link from "next/link";
import { RichText } from "@atproto/api";
import LocalTime from "@/app/components/LocalTime";
import {
  DEFAULT_GUESTBOOK_CAP,
  type Guestbook as GuestbookData,
  type GuestbookEntry,
  WHO_CAN_SIGN_LABELS,
} from "@/lib/guestbook/entries";
import { memberPath } from "@/lib/photos/urls";
import HideButton from "./HideButton";
import SignForm from "./SignForm";
import CommentSettings from "./CommentSettings";

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
  isOwner = false,
  signBlocked = null,
}: {
  guestbook: GuestbookData;
  ownerDid: string;
  rkey: string;
  bskyUrl: string | null;
  signedIn: boolean;
  isOwner?: boolean;
  /** Why the signed-in viewer can't sign, if they can't. */
  signBlocked?: string | null;
}) {
  const { entries, closed, count } = guestbook;
  const full = count >= DEFAULT_GUESTBOOK_CAP;
  return (
    <section className="guestbook" aria-labelledby="guestbook-heading">
      <div className="guestbook-heading">
        <h3 id="guestbook-heading" className="rail-heading">
          Guestbook Comments ({entries.length})
        </h3>
        <div className="who-can-comment">
          {full ? (
            "Guestbook full"
          ) : (
            <>
              Who can comment: {WHO_CAN_SIGN_LABELS[guestbook.who]}
              {isOwner && <CommentSettings ownerDid={ownerDid} rkey={rkey} who={guestbook.who} />}
            </>
          )}
        </div>
      </div>
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
                {isOwner && e.author.did !== ownerDid && (
                  <>
                    {" "}
                    <HideButton ownerDid={ownerDid} rkey={rkey} entryUri={e.uri} />
                  </>
                )}
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
      {full ? (
        <p className="rail-empty">This guestbook is full.</p>
      ) : closed && !isOwner ? (
        <p className="rail-empty">This guestbook is closed.</p>
      ) : signBlocked ? (
        <p className="rail-empty">
          {signBlocked}
          {bskyUrl && guestbook.who === "custom" && (
            <>
              {" "}
              <a href={bskyUrl}>Open on Bluesky</a>.
            </>
          )}
        </p>
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
