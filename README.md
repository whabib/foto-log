# foto-log

A revival of [Fotolog.com](https://en.wikipedia.org/wiki/Fotolog), the late-2000s site where everyone kept a fotolog, rebuilt on the [AT Protocol](https://atproto.com) so it has a better chance of surviving than the original did.

Hosted at **[foto-log.com](https://foto-log.com)**.

## The idea

Fotolog was simple: one photo a day, a caption, and a guestbook where friends left comments. Its posts lived on a single company's servers, and when that company stopped, they were gone.

foto-log keeps the same one-photo-a-day rhythm, but posts are stored as records in each user's own AT Protocol repository (their PDS), under a custom lexicon. Users sign in with their existing Atmosphere / Bluesky identity, own their data, and can take it with them. If foto-log.com ever goes away, the photos don't.

## Stack (v1)

- **Language / framework:** TypeScript, Next.js
- **AT Protocol:** `@atproto/api`, `@atproto/oauth-client-node` (OAuth sign-in with the user's PDS)
- **Lexicon:** `com.foto-log.photo` (custom record type for photo posts)
- **Database:** Postgres via Drizzle ORM (indexing / app view state)
- **Hosting:** Google Cloud Run, Cloud SQL, Secret Manager, Artifact Registry, Cloud Build

## Development

```sh
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm run build
```

Merges to `main` deploy to Cloud Run automatically. See [docs/infra.md](docs/infra.md) and [docs/plan.md](docs/plan.md).
