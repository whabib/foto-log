# Infrastructure

Everything is in GCP project `foto-log-app` (billing: Pointless Enterprises), region `us-central1`.

## App

| Resource | Name |
|---|---|
| Cloud Run service | `foto-log-web` (min 0 / max 3 instances, 512 MiB, ingress: load balancer only) |
| Runtime service account | `foto-log-web@foto-log-app.iam.gserviceaccount.com`: `roles/cloudsql.client` on the project, plus `roles/secretmanager.secretAccessor` on the four secrets below only |
| Artifact Registry (Docker) | `us-central1-docker.pkg.dev/foto-log-app/foto-log`, image `web`. Deploy, preview and scan images (`scan-*` tags) all go here. Cleanup policy (set by hand) keeps the 25 most recent versions, so a rollback target is always still there. |

### Cloud Run settings

Set once by hand. The deploy workflow only changes the image, so these persist across deploys.

| Setting | Value |
|---|---|
| Env `PUBLIC_URL` | `https://foto-log.com` (turns on production mode) |
| Env `INSTANCE_CONNECTION_NAME` | `foto-log-app:us-central1:foto-log-db` |
| Env `DB_USER` / `DB_NAME` | `fotolog` / `fotolog` |
| Secret env vars | `OAUTH_PRIVATE_KEY`, `COOKIE_SECRET`, `STORE_ENCRYPTION_KEY`, `DB_PASSWORD` (see below) |
| Network | Direct VPC egress on network `default`, subnet `default`, `private-ranges-only` |

## Database (Cloud SQL)

| | |
|---|---|
| Instance | `foto-log-db`, PostgreSQL 17, Enterprise edition, `db-f1-micro` (shared core, 0.6 GB), zonal, us-central1 |
| Connection name | `foto-log-app:us-central1:foto-log-db` |
| Network | **Private IP only** on VPC `default`, via private services access (range `google-managed-services-default`, /20). No public IP. |
| Storage | 10 GB SSD, auto-increase on |
| Backups | Daily at 08:00 UTC, 7 kept |
| Deletion protection | On |
| Database / user | `fotolog` / `fotolog` (built-in user; password in Secret Manager `db-password`) |
| Cost | About $9–11/month (instance about $7.70, storage $1.70, backups under $1) |

The app connects with the Cloud SQL Node.js connector (`@google-cloud/cloud-sql-connector`, private IP, TLS) using the password user. Migrations in `drizzle/` run at server start under an advisory lock (`lib/db/migrate.ts`).

To get a SQL shell, use Cloud SQL Studio in the console. The instance has no public IP, so `gcloud sql connect` from a laptop won't work.

## Secrets (Secret Manager)

| Secret | Env var | Contents |
|---|---|---|
| `oauth-private-key` | `OAUTH_PRIVATE_KEY` | ES256 private JWK, kid `foto-log-2026-10` (OAuth client authentication) |
| `cookie-secret` | `COOKIE_SECRET` | 32 random bytes, base64 (signs the session cookie) |
| `store-encryption-key` | `STORE_ENCRYPTION_KEY` | 32 random bytes, base64 (encrypts OAuth state and sessions in Postgres) |
| `db-password` | `DB_PASSWORD` | Password for database user `fotolog` |
| `index-tick-secret` | `INDEX_TICK_SECRET` | 32 random bytes, hex (Cloud Scheduler's bearer token for `/api/index-tick`) |

All were generated directly into Secret Manager and never written to disk. Only the runtime service account can read them. Mounted as `:latest`, so a new version takes effect on the next deploy. See [auth.md](auth.md) for rotation.

## Photo index (Cloud Scheduler)

The home page lists photos from the `photo_index` table. foto-log writes its own posts and deletes to it directly. Everything else arrives from Bluesky's Jetstream: every 3 minutes, Cloud Scheduler job `foto-log-index-tick` POSTs to `https://foto-log.com/api/index-tick` with `Authorization: Bearer <INDEX_TICK_SECRET>`. Each run reads Jetstream from the cursor saved in `app_state` until it catches up (at most 45 seconds). The stream also carries Bluesky posts, so members' post deletes are recorded in `deleted_post`; each run then deletes the photos that shared those posts, using the member's stored sign-in (without it, the photo is only kept out of the index). Then each run copies the photos of up to 5 members who haven't been backfilled yet; when none are waiting, it backfills one member whose last backfill is over 7 days old again, as a safety net for anything Jetstream missed. Overlapping runs skip. An always-on worker is #45.

Each run reads from `jetstream2.us-east.bsky.network` first. If that instance can't be reached or sends nothing, it tries `jetstream1.us-east`, then the two `us-west` instances, starting 10 seconds before the cursor. Every read starts 10 seconds early, since the saved cursor may come from another instance and instances' clocks differ slightly; replaying is harmless. `JETSTREAM_URL` overrides the list (one URL, or several separated by commas).

Each run logs one `Index tick` entry with the event and change counts, the instance read (`catchUp.host`), why it stopped (`catchUp.stoppedBy`), and how far the cursor is behind real time (`catchUp.lagSeconds`). If the cursor is more than 15 minutes behind, the run logs an ERROR (`Index tick: the index is behind Jetstream`) and returns 500, so Cloud Scheduler records the attempt as failed. A Jetstream disconnect mid-run is logged as a WARNING and retried from the cursor on the next run.

Cost: Cloud Scheduler's first 3 jobs per billing account are free, and the Cloud Run time is a few seconds every 3 minutes.

Set up once, after the PR that adds the endpoint is merged and deployed (so the service update below builds on the `main` revision):

```sh
# The shared secret.
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create index-tick-secret --project=foto-log-app --data-file=-
gcloud secrets add-iam-policy-binding index-tick-secret --project=foto-log-app \
  --member=serviceAccount:foto-log-web@foto-log-app.iam.gserviceaccount.com --role=roles/secretmanager.secretAccessor
gcloud run services update foto-log-web --project=foto-log-app --region=us-central1 \
  --update-secrets=INDEX_TICK_SECRET=index-tick-secret:latest

# The job.
gcloud services enable cloudscheduler.googleapis.com --project=foto-log-app
gcloud scheduler jobs create http foto-log-index-tick --project=foto-log-app --location=us-central1 \
  --schedule="*/3 * * * *" --uri=https://foto-log.com/api/index-tick --http-method=POST \
  --attempt-deadline=300s \
  --headers="Authorization=Bearer $(gcloud secrets versions access latest --secret=index-tick-secret --project=foto-log-app)"
```

The attempt deadline is 300 seconds, the same as Cloud Run's default request timeout. A run usually takes well under a minute, but one that also backfills several large repos can take longer, and a shorter deadline would record that as a failed attempt even though the run finished. To change it on the existing job:

```sh
gcloud scheduler jobs update http foto-log-index-tick --project=foto-log-app --location=us-central1 \
  --attempt-deadline=300s
```

Check it with `gcloud scheduler jobs run foto-log-index-tick --project=foto-log-app --location=us-central1` and the `Index tick` lines in the Cloud Run logs. The token is stored in the job's config, so anyone who can view Cloud Scheduler jobs in the project can read it; it only lets them run the indexer.

## CI/CD

- `.github/workflows/ci.yml`: on every PR, runs lint, typecheck and build.
- `.github/workflows/deploy.yml`: on push to `main`, builds the image, tags it with the commit SHA, pushes it, deploys it to Cloud Run tagged `main`, and routes 100% of traffic to the new revision (`update-traffic --to-latest`). The deploy sets a startup probe on `/health` (every 2 seconds, up to 60 seconds), so a revision that can't reach the database never gets ready and never gets traffic. The probe is part of the service's config, so preview deploys and every cold start use it too. After traffic moves, the workflow checks `https://foto-log.com/health` for up to 90 seconds, until the new revision answers `ok` (`/health` reports the revision serving it, from `K_REVISION`); if it never does, it sends traffic back to the revision that was tagged `main` before the deploy, moves the `main` tag back to it, and fails.
- `.github/workflows/preview.yml` (run by hand from the Actions tab, or `gh workflow run preview.yml -f pr=NN -f action=deploy`) tries a PR on the real domain before merging. `deploy` builds the PR's head and deploys it with `--no-traffic --tag=prNN`; `promote` sends 100% of traffic to that tag; `restore` sends traffic back to the revision tagged `main`, which `deploy.yml` moves to each revision it deploys from `main` (a preview deploy becomes Cloud Run's latest revision, so restoring to "latest" would serve the preview). `restore` doesn't look up the PR, so it works after the PR is closed. Only PRs from branches in this repository are deployed. The next merge to `main` also moves traffic back to the latest revision.
- GitHub Actions authenticates with Workload Identity Federation, not JSON keys:
  - Pool `github`, provider `github`, restricted to repository ID `1406276002` (whabib/foto-log) and owner ID `779276`.
  - It impersonates `github-deployer@foto-log-app.iam.gserviceaccount.com`, which has `roles/run.developer` on the project, `roles/artifactregistry.writer` on the `foto-log` repo, and `roles/iam.serviceAccountUser` on the runtime service account only.
- `run.developer` can't change who's allowed to call the service, so the CI pipeline can't make the service private or public. That stays a manual decision.

## Edge (global external HTTPS load balancer)

| Resource | Name / value |
|---|---|
| Static IPv4 | `foto-log-ip`: `136.81.16.163` |
| Static IPv6 | `foto-log-ipv6`: `2600:1901:0:461c::` |
| Serverless NEG | `foto-log-web-neg` (us-central1 → Cloud Run `foto-log-web`) |
| Backend service | `foto-log-web-be` (EXTERNAL_MANAGED, CDN off) |
| URL map (HTTPS) | `foto-log-https`: everything goes to the backend; `www.foto-log.com` gets a 301 to `foto-log.com` |
| URL map (HTTP) | `foto-log-http-redirect`: 301 to HTTPS |
| Certificate | `foto-log-cert`: Google-managed, for `foto-log.com` and `www.foto-log.com` |
| Proxies | `foto-log-https-proxy`, `foto-log-http-proxy` |
| Forwarding rules | `foto-log-https-v4`, `foto-log-http-v4`, `foto-log-https-v6`, `foto-log-http-v6` |

### DNS

DNS for foto-log.com is hosted in **AWS Route 53** (the registrar is Amazon), so these records are managed there, not in GCP:

| Name | Type | Value |
|---|---|---|
| `foto-log.com` | A | `136.81.16.163` |
| `foto-log.com` | AAAA | `2600:1901:0:461c::` |
| `www.foto-log.com` | A | `136.81.16.163` |
| `www.foto-log.com` | AAAA | `2600:1901:0:461c::` |

The managed certificate only becomes ACTIVE after these records resolve to the load balancer. That can take anywhere from 15 minutes to about a day. Check with:

```sh
gcloud compute ssl-certificates describe foto-log-cert --global --project=foto-log-app --format='value(managed.status, managed.domainStatus)'
```

### Ingress

Cloud Run ingress is `internal-and-cloud-load-balancing`, so public internet traffic must come through the load balancer; qualifying internal traffic can still reach the service directly. Direct public requests to the `*.run.app` URL return 404. The deploy workflow doesn't change this setting.

## Logging

The server logs through `lib/log.ts`. In production each entry is one line of JSON, which Cloud Logging reads as a structured entry: `severity` (INFO, WARNING, ERROR) sets the level, `message` is the summary, and every other field can be searched, for example `jsonPayload.did="did:plc:…"`. Errors are written out with their name, message, stack, cause and fields like `status`. An ERROR entry that carries an error also gets the stack in `stack_trace`, so Error Reporting groups it. Locally (`npm run dev`) it logs to the console as before. `LOG_FORMAT=json` or `LOG_FORMAT=pretty` overrides either.

Useful Logs Explorer queries (resource `cloud_run_revision`, service `foto-log-web`):

- Everything that went wrong: `severity>=WARNING`
- Index runs: `jsonPayload.message=~"^Index tick"`
- One member: `jsonPayload.did="did:plc:…"`

## Monitoring and alerts

Set up once, by hand. The alert policies are in `infra/monitoring/`. Run these from the repo root, signed in to gcloud as a project owner.

```sh
gcloud services enable monitoring.googleapis.com billingbudgets.googleapis.com --project=foto-log-app

# Where alerts go: an email channel (the channels command is still in gcloud beta).
gcloud beta monitoring channels create --project=foto-log-app \
  --display-name="foto-log alerts" --type=email --channel-labels=email_address=YOU@example.com
CHANNEL=$(gcloud beta monitoring channels list --project=foto-log-app \
  --filter='displayName="foto-log alerts"' --format='value(name)')

# Uptime check: GETs https://foto-log.com/health every 5 minutes from several regions
# and expects "ok":true (it returns 503 when the database can't be reached).
gcloud monitoring uptime create foto-log-health --project=foto-log-app \
  --resource-type=uptime-url --resource-labels=host=foto-log.com,project_id=foto-log-app \
  --protocol=https --path=/health --period=5 --timeout=10 \
  --matcher-type=contains-string --matcher-content='"ok":true'

# Alert policies: site down (2+ regions failing the uptime check), more than 10
# 5xx responses in 5 minutes, and Cloud SQL CPU, memory or disk running high.
for policy in uptime cloud-run-5xx cloud-sql; do
  gcloud monitoring policies create --project=foto-log-app \
    --policy-from-file="infra/monitoring/$policy.json" --notification-channels="$CHANNEL"
done

# Billing budget for this project, with emails at 50%, 90% and 100%, and at 100% of the forecast.
# Needs Billing Account Administrator (or Costs Manager) on the billing account.
# The amount is a starting point: today's run rate is roughly $30/month
# (Cloud SQL about $10, the load balancer's forwarding rules about $18, Cloud Run a little).
BILLING=$(gcloud billing projects describe foto-log-app --format='value(billingAccountName)' | sed 's|billingAccounts/||')
gcloud billing budgets create --billing-account="$BILLING" \
  --display-name="foto-log-app monthly" --budget-amount=50USD \
  --filter-projects=projects/foto-log-app \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 \
  --threshold-rule=percent=1.0,basis=forecasted-spend \
  --notifications-rule-monitoring-notification-channels="$CHANNEL"
```

Check them with `gcloud monitoring policies list --project=foto-log-app --format='table(displayName,enabled)'` and `gcloud monitoring uptime list-configs --project=foto-log-app`. To test the email channel, go to **Monitoring → Alerting → Edit notification channels** in the console and send a test notification from "foto-log alerts".

Uptime checks, alert policies and email notifications are free at this size. Budgets are free.

Failed index runs have their own alert, created separately because it matches log entries rather than a metric. It emails at most once an hour when an index run logs `Index tick failed` or `Index tick: the index is behind Jetstream`, or when Cloud Scheduler logs a failed attempt for `foto-log-index-tick` (a 500, a 401 from a token that no longer matches, or a run past the 300-second deadline):

```sh
gcloud monitoring policies create --project=foto-log-app \
  --policy-from-file=infra/monitoring/index-tick.json --notification-channels="$CHANNEL"
```

In a new shell, set `CHANNEL` again first with the `gcloud beta monitoring channels list` command above.
