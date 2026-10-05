# Infrastructure

Everything is in GCP project `foto-log-app` (billing: Pointless Enterprises), region `us-central1`.

## App

| Resource | Name |
|---|---|
| Cloud Run service | `foto-log-web` (min 0 / max 3 instances, 512 MiB) |
| Runtime service account | `foto-log-web@foto-log-app.iam.gserviceaccount.com` (no project roles) |
| Artifact Registry (Docker) | `us-central1-docker.pkg.dev/foto-log-app/foto-log`, image `web` |

## CI/CD

- `.github/workflows/ci.yml`: on every PR, runs lint, typecheck and build.
- `.github/workflows/deploy.yml`: on push to `main`, builds the image, tags it with the commit SHA, pushes it, and deploys it to Cloud Run.
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

### Follow-up

Once the cert is ACTIVE, restrict Cloud Run ingress so all traffic has to come through the load balancer:

```sh
gcloud run services update foto-log-web --region=us-central1 --project=foto-log-app --ingress=internal-and-cloud-load-balancing
```
