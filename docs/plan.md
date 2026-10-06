# foto-log v1 plan

> The full plan lives in the project thread and hasn't been copied here yet. This is a summary built from the README and the v1 issues. Replace it with the full text when it's available.

## Goal

Revive Fotolog.com, where each user keeps a fotolog (one photo a day, a caption, and a guestbook), on the AT Protocol, so users own their posts and the site can go away without taking the photos with it. Hosted at foto-log.com on Google Cloud.

## Decisions so far

- **Naming:** a user's photo blog is always called a **fotolog**, never a "photoblog", in UI copy, docs and code.
- **Stack:** TypeScript, Next.js (App Router, standalone output), `@atproto/api`, `@atproto/oauth-client-node`, Postgres via Drizzle.
- **Hosting:** Cloud Run (`foto-log-web`, us-central1) in GCP project `foto-log-app`, behind a global external HTTPS load balancer.
- **Lexicon:** `com.foto-log.photo`, with record key = `uploadDate` (`YYYY-MM-DD`).
- **One photo per day.** Each photo has an upload date and a display date. In v1 they are always the same; letting users change the display date (for example, several photos from one event) is deferred because of how it affects feed ordering.
- **Tracking:** GitHub Issues with the `v1` milestone.

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
