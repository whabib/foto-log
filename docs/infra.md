# Infrastructure

Everything is in GCP project `foto-log-app` (billing: Pointless Enterprises), region `us-central1`.

## App

| Resource | Name |
|---|---|
| Cloud Run service | `foto-log-web` (min 0 / max 3 instances, 512 MiB, ingress: load balancer only) |
| Runtime service account | `foto-log-web@foto-log-app.iam.gserviceaccount.com`: `roles/cloudsql.client` on the project, plus `roles/secretmanager.secretAccessor` on the four secrets below only |
| Artifact Registry (Docker) | `us-central1-docker.pkg.dev/foto-log-app/foto-log`, image `web` |

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

All were generated directly into Secret Manager and never written to disk. Only the runtime service account can read them. Mounted as `:latest`, so a new version takes effect on the next deploy. See [auth.md](auth.md) for rotation.

## CI/CD

- `.github/workflows/ci.yml`: on every PR, runs lint, typecheck and build.
- `.github/workflows/deploy.yml`: on push to `main`, builds the image, tags it with the commit SHA, pushes it, deploys it to Cloud Run, and routes 100% of traffic to the new revision (`update-traffic --to-latest`).
- To try a PR on the real domain before merging, deploy it with `--no-traffic --tag=prNN`, then `gcloud run services update-traffic foto-log-web --to-tags=prNN=100`. The next merge to `main` moves traffic back to the latest revision.
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
