import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MemberFrame } from "@/app/components/MemberPage";
import { getCurrentUser } from "@/lib/auth";
import {
  addDays,
  addMonths,
  dayLabel,
  monthLabel,
  monthWeeks,
  parseDay,
  parseMonth,
  WEEKDAYS,
  weekDays,
  weekdayLabel,
  weekStart,
} from "@/lib/calendar";
import { getGroup } from "@/lib/groups-server";
import { type Member, resolveMemberPage } from "@/lib/member-resolve-server";
import { getMemberImages } from "@/lib/member-profile-server";
import { memberPageLook } from "@/lib/member-settings";
import { getMemberSettings } from "@/lib/member-settings-server";
import { type CalendarPhoto, photoDayRange, photosBetween } from "@/lib/photo-calendar-server";
import { displayName, photoCalendarPath, photoKeyPath, thumbnailUrl } from "@/lib/photos/urls";

type Props = {
  params: Promise<{ actor: string }>;
  searchParams: Promise<{ month?: string | string[]; week?: string | string[] }>;
};

/** Which month or week the page shows: from the query, else the newest photo's month. */
type View = { kind: "month"; month: string } | { kind: "week"; sunday: string };

async function load({ params, searchParams }: Props) {
  const [{ actor }, query] = await Promise.all([params, searchParams]);
  const month = parseMonth(query.month);
  const week = parseDay(query.week);
  const rest = week ? `/photos?week=${weekStart(week)}` : month ? `/photos?month=${month}` : "/photos";
  const owner = await resolveMemberPage(actor, rest);
  return owner ? { owner, month, week } : null;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const loaded = await load(props);
  if (!loaded) return { title: "Member not found · foto-log" };
  return { title: `${displayName(loaded.owner)}'s photos · foto-log` };
}

/**
 * A member's photos on a calendar, a month at a time, each day showing its
 * photo. A group's day shows its newest photo, and each week opens a view
 * of every photo that week. Any member's week can be opened from the URL.
 */
export default async function PhotoCalendarPage(props: Props) {
  const loaded = await load(props);
  if (!loaded) notFound();
  const { owner } = loaded;
  const [settings, images, user, group, range] = await Promise.all([
    getMemberSettings(owner.did),
    getMemberImages(owner),
    getCurrentUser(),
    getGroup(owner.did),
    photoDayRange(owner.did),
  ]);
  const isGroup = group !== null;
  const view: View = loaded.week
    ? { kind: "week", sunday: weekStart(loaded.week) }
      : {
          kind: "month",
          month:
            loaded.month ??
            range?.last.slice(0, 7) ??
            // No photos: this month.
            new Date().toISOString().slice(0, 7),
        };

  return (
    <MemberFrame owner={owner} look={memberPageLook(settings, owner)} images={images} signedIn={user !== null}>
      <div className="photo-calendar">
        {view.kind === "month" ? (
          <MonthView owner={owner} month={view.month} range={range} isGroup={isGroup} />
        ) : (
          <WeekView owner={owner} sunday={view.sunday} range={range} />
        )}
      </div>
    </MemberFrame>
  );
}

type Range = { first: string; last: string } | null;

async function MonthView({ owner, month, range, isGroup }: { owner: Member; month: string; range: Range; isGroup: boolean }) {
  const weeks = monthWeeks(month);
  const photos = await photosBetween(owner.did, `${month}-01`, `${month}-31`);
  // Each day's newest photo: the last by record key.
  const byDay = new Map<string, CalendarPhoto>();
  let multi = false;
  for (const p of photos) {
    if (byDay.has(p.uploadDate)) multi = true;
    byDay.set(p.uploadDate, p);
  }
  // Week views show every photo of each day: for groups, and for anyone with
  // a day of several (a former group, say), so none is out of reach.
  const weekLinks = isGroup || multi;
  const prev = range && month > range.first.slice(0, 7) ? addMonths(month, -1) : null;
  const next = range && month < range.last.slice(0, 7) ? addMonths(month, 1) : null;

  return (
    <>
      <nav className="calendar-nav" aria-label="Months">
        {prev ? (
          <Link href={photoCalendarPath(owner, { month: prev })} rel="prev">
            ‹ {monthLabel(prev)}
          </Link>
        ) : (
          <span />
        )}
        <h2>{monthLabel(month)}</h2>
        {next ? (
          <Link href={photoCalendarPath(owner, { month: next })} rel="next">
            {monthLabel(next)} ›
          </Link>
        ) : (
          <span />
        )}
      </nav>
      <table className={weekLinks ? "calendar has-weeks" : "calendar"}>
        <thead>
          <tr>
            {weekLinks && (
              <th scope="col">
                <span className="sr-only">Week</span>
              </th>
            )}
            {WEEKDAYS.map((d) => (
              <th key={d} scope="col">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((days) => {
            const sunday = weekStart(days.find((d) => d !== null)!);
            return (
              <tr key={sunday}>
                {weekLinks && (
                  <td className="calendar-week">
                    <Link href={photoCalendarPath(owner, { week: sunday })} aria-label={`Week of ${dayLabel(sunday)}`}>
                      Week »
                    </Link>
                  </td>
                )}
                {days.map((day, i) => {
                  if (!day) return <td key={i} className="calendar-blank" />;
                  const photo = byDay.get(day);
                  return (
                    <td key={day} className={photo ? "has-photo" : undefined}>
                      <span className="calendar-day">{Number(day.slice(8))}</span>
                      {photo && <Thumb owner={owner} photo={photo} label={dayLabel(day)} />}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {photos.length === 0 && <p className="rail-empty calendar-empty">No photos this month.</p>}
    </>
  );
}

async function WeekView({ owner, sunday, range }: { owner: Member; sunday: string; range: Range }) {
  const days = weekDays(sunday);
  const photos = await photosBetween(owner.did, days[0], days[6]);
  const prev = range && sunday > range.first ? addDays(sunday, -7) : null;
  const next = range && days[6] < range.last ? addDays(sunday, 7) : null;

  return (
    <>
      <nav className="calendar-nav" aria-label="Weeks">
        {prev ? (
          <Link href={photoCalendarPath(owner, { week: prev })} rel="prev">
            ‹ Previous week
          </Link>
        ) : (
          <span />
        )}
        <h2>Week of {dayLabel(sunday)}</h2>
        {next ? (
          <Link href={photoCalendarPath(owner, { week: next })} rel="next">
            Next week ›
          </Link>
        ) : (
          <span />
        )}
      </nav>
      <p className="calendar-back">
        <Link href={photoCalendarPath(owner, { month: sunday.slice(0, 7) })}>« Back to {monthLabel(sunday.slice(0, 7))}</Link>
      </p>
      <ol className="calendar-week-days">
        {days.map((day) => {
          const dayPhotos = photos.filter((p) => p.uploadDate === day);
          return (
            <li key={day}>
              <h3>{weekdayLabel(day)}</h3>
              {dayPhotos.length > 0 ? (
                <ul>
                  {dayPhotos.map((p) => (
                    <li key={p.rkey}>
                      <Thumb owner={owner} photo={p} label={dayLabel(day)} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rail-empty">No photos.</p>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Thumb({ owner, photo, label }: { owner: Member; photo: CalendarPhoto; label: string }) {
  return (
    <Link href={photoKeyPath(owner, photo.rkey)} className="calendar-photo" title={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbnailUrl(owner.did, photo.imageCid)} alt={photo.alt || `Photo from ${label}`} loading="lazy" />
    </Link>
  );
}
