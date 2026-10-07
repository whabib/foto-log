# foto-log v1 plan

> The full plan lives in the project thread and hasn't been copied here yet. This is a summary built from the README and the v1 issues. Replace it with the full text when it's available.

## Goal

Revive Fotolog.com, where each user keeps a fotolog (one photo a day, a caption, and a guestbook), on the AT Protocol, so users own their posts and the site can go away without taking the photos with it. Hosted at foto-log.com on Google Cloud.

## Decisions so far

- **Naming:** a user's photo blog is always called a **fotolog**, never a "photoblog", in UI copy, docs and code.
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

## v1 work items

1. #1 Setup: DNS for foto-log.com via HTTPS load balancer + managed cert
2. #2 Setup: CI (GitHub Actions → Artifact Registry → Cloud Run) + empty Next.js site live
3. #3 Sign-in: ATProto OAuth with @atproto/oauth-client-node
4. #4 Lexicon: define com.foto-log.photo
5. #9 Post a photo: upload page and record writes
6. #5 Fotolog page `/<handle>`
7. #10 Guestbook: Bluesky replies as guestbook entries
8. #6 Index + home page: Jetstream consumer into Postgres
9. #7 Image proxy fallback via getBlob + Cloud CDN
10. #8 Hardening: rate limits, reporting, errors, uptime, launch checklist
