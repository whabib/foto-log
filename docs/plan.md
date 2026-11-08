# foto-log v1 plan

> The full plan lives in the project thread and hasn't been copied here yet. This is a summary built from the README and the v1 issues. Replace it with the full text when it's available.

## Goal

Revive Fotolog.com, where each user keeps a fotolog (one photo a day, a caption, and a guestbook), on the AT Protocol, so users own their posts and the site can go away without taking the photos with it. Hosted at foto-log.com on Google Cloud.

## Decisions so far

- **Naming:** a user's photo blog is always called a **fotolog**, never a "photoblog", in UI copy, docs and code. Each member's home page (their fotolog's main page, `/@handle`) is called the **member page** in docs, code and issues; in UI copy it's the member's "Fotolog".
- **Member page settings live in our database, by Warren's choice.** Title, location and colors are stored in foto-log's Postgres (`member_settings`), not in the member's ATProto repo. That keeps the OAuth permissions unchanged; the trade-off is that these settings don't travel with the account.
- **Stack:** TypeScript, Next.js (App Router, standalone output), `@atproto/api`, `@atproto/oauth-client-node`, Postgres via Drizzle.
- **Hosting:** Cloud Run (`foto-log-web`, us-central1) in GCP project `foto-log-app`, behind a global external HTTPS load balancer.
- **Lexicon:** `com.foto-log.photo`, with record key `YYYY-MM-DD-NN` (upload date plus a two-digit sequence). See Data model.
- **One photo per day, for now.** The limit is a per-account setting (default 1) enforced by the app, not built into the record key, so allowing more photos per day later (for example, a paid tier) only means raising the limit. Each photo has an upload date and a display date. In v1 they are always the same; letting users change the display date (for example, several photos from one event) is deferred because of how it affects feed ordering.
- **Tracking:** GitHub Issues with the `v1` milestone.

## Data model

Each photo is a `com.foto-log.photo` record in the poster's own repo. Full schema: [lexicon.md](lexicon.md).

- **Record key:** `YYYY-MM-DD-NN`: the upload date in the poster's time zone plus a sequence number for that day (`01`-`99`). While the daily limit is 1, it's always `-01`, e.g. `2026-10-06-01`.
- **uploadDate** is stored as its own field, as well as in the key.
- **displayDate** equals uploadDate in v1.
- **Daily limit:** before posting, the app counts the account's records for that date against its limit (default 1) and uses the next free sequence number. With a limit of 1, that's a single `getRecord` for `YYYY-MM-DD-01`.
- Each photo also creates an `app.bsky.feed.post` (referenced by `post`). Replies to it form the photo's guestbook.

### Member page settings (Postgres, not ATProto)

Table `member_settings`, one row per member, keyed by DID. Edited on `/settings` ("Customize your member page"). Every column except the timestamps is nullable, and null means the default.

| Column | Meaning | Default |
|---|---|---|
| `title` | Member page title, up to 64 characters | "<handle>'s Fotolog" |
| `country` | ISO 3166-1 alpha-2 code | not shown |
| `region` | ISO 3166-2 code for US, CA, AU, BR, MX and IN (e.g. `US-TX`); free text elsewhere | not shown |
| `locality` | City or town, free text | not shown |
| `background_color` | `#rrggbb` | `#ffffff` |
| `text_color` | `#rrggbb` | `#1a1a1a` |

Locations display the way each country usually writes them: "Austin, TX, United States", "Guadalajara, Jalisco, Mexico", "Lyon, France". Saving requires signing in as that member. Reading is public (the member page needs no login), with a 30-second cache per server instance. The settings page warns, without blocking, when the colors' contrast is below WCAG AA (4.5:1).

## v1 work items

1. #1 Setup: DNS for foto-log.com via HTTPS load balancer + managed cert
2. #2 Setup: CI (GitHub Actions → Artifact Registry → Cloud Run) + empty Next.js site live
3. #3 Sign-in: ATProto OAuth with @atproto/oauth-client-node
4. #4 Lexicon: define com.foto-log.photo
5. #9 Post a photo: upload page and record writes
6. #21 Account settings: customize your member page
7. #5 Member page `/<handle>`
8. #10 Guestbook: Bluesky replies as guestbook entries
9. #6 Index + home page: Jetstream consumer into Postgres
10. #7 Image proxy fallback via getBlob + Cloud CDN
11. #8 Hardening: rate limits, reporting, errors, uptime, launch checklist
