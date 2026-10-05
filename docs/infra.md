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

## Edge

See #1. A global external HTTPS load balancer (`foto-log-*` resources) with a serverless NEG pointing at `foto-log-web` and a Google-managed certificate for `foto-log.com` and `www.foto-log.com`. DNS for foto-log.com is hosted in AWS Route 53, not in GCP.
