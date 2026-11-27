# Run Sugar Dash locally and deploy the demo

This repository has two separate Compose setups:

- `docker-compose.yml` runs the app on your machine with a local Supabase PostgreSQL container.
- `demo/compose.yaml` is the platform submission file. GitHub Actions builds its images and publishes them to GHCR; the demo platform pulls them. Docker Desktop is not needed for the demo deployment.

## Prerequisites

- Docker Engine with the Docker Compose v2 plugin (Docker Desktop is one way to provide these for Windows development, but is not required on the Linux demo host)
- Node.js and npm
- Available local ports `3000`, `54322`, and `8080` for local development

## Run locally

From the repository root, start the local Supabase PostgreSQL container and apply the checked-in schema migration. These commands use the local Supabase CLI project and do not connect to hosted Supabase.

Linux or macOS:

```bash
npx --yes supabase@3.4.0 start --exclude kong
npx --yes supabase@3.4.0 migration up
docker compose up --build
```

Windows PowerShell:

```powershell
npx.cmd --yes supabase@3.4.0 start --exclude kong
npx.cmd --yes supabase@3.4.0 migration up
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). The API listens on [http://localhost:3000](http://localhost:3000).

To check that the app and API respond, open the app or visit these endpoints:

- `http://localhost:8080/` - client app (HTTP 200)
- `http://localhost:3000/api/restaurants` - restaurant data (HTTP 200 with the configured restaurants)
- `http://localhost:3000/api/ratings/restaurants` - rating summaries (HTTP 200; `[]` is expected before any ratings exist)

If startup reports that port `3000` is already in use, close the existing Sugar Dash server terminal before starting the Compose stack. Ports `8080` (client) and `54322` (local PostgreSQL) must also be available.

The backend seeds restaurants and menus from `my-app/server/config/sugardash.initial-city.json` and creates the demo accounts at startup. It does not create orders; place them through the app.

## Stop and preserve the local database

Stop the app with `Ctrl+C` or `docker compose down`. To stop the local Supabase database too, run:

Linux or macOS:

```bash
npx --yes supabase@3.4.0 stop
```

Windows PowerShell:

```powershell
npx.cmd --yes supabase@3.4.0 stop
```

The database remains in the Supabase CLI's Docker-managed volume. Starting Supabase again reuses it. `supabase db reset` deletes and recreates the local database, so use it only when you intentionally want a clean reset.

## Database setup files

- `supabase/config.jsonc` configures the local database. Unused Auth, API, Storage/S3, Realtime, Studio, email, Functions, and analytics services are disabled.
- `supabase/migrations/` contains the schema needed to create the local database.
- Seed data is provided by the existing backend seeders after the server starts; Supabase CLI SQL seeding is disabled.

The server container connects to local PostgreSQL through `host.docker.internal`; Compose adds the host-gateway mapping for Linux compatibility. The local database uses the checked-in local-only `postgres:postgres` credentials. No `.env` file or hosted Supabase values are needed.

## Publish images and submit the demo

The workflow in `.github/workflows/publish-demo-images.yml` publishes three `linux/amd64` images to GitHub Container Registry (GHCR): the server, client, and database. Each image is tagged with the commit SHA from that workflow run. It uses GitHub's built-in `GITHUB_TOKEN`; you do not need to add GitHub Actions secrets. It runs on pushes to the repository's default branch and on tags. Runs from other branches are skipped.

1. Commit and push these files to the default branch. In GitHub, open **Actions** and the **Publish demo images** run. The run summary prints the three `image:` lines.
2. On GitHub's **Packages** page, change each image package's visibility to **Public** so the demo platform can pull them without a registry token.
3. Replace the three placeholder `image:` values in `demo/compose.yaml` with the exact lines from the run summary, then commit and push that update.
4. Upload or paste `demo/compose.yaml` into the course platform's compose checker, fix any reported issue, then submit it on the group page.

The platform Compose file intentionally has no `build:`, `env_file:`, or host `ports:` entries. It exposes the client through `x-demo`; nginx serves the production frontend and proxies `/api` to the private server service. The database schema is initialized from `supabase/migrations/` when the named database volume is first created. The server then seeds the configured restaurants, menus, and demo accounts. The Compose file declares a named database volume; data persists across container recreation when the platform retains that volume.

The platform setup needs no hosted Supabase, AWS/S3, or other third-party credentials. The database password in `demo/compose.yaml` is a demo-only credential for the private database service; do not reuse it elsewhere.

To rehearse the exact platform stack locally without publishing or pulling images, build the three local images and run the rehearsal override:

```bash
docker compose build
docker build --file demo/database/Dockerfile --tag sugardash-demo-database:check .
docker compose -f demo/compose.yaml -f demo/rehearse.yaml up
```

Open [http://localhost:8081](http://localhost:8081). The override supplies local image names and a laptop port; neither appears in the platform submission file. Stop it with `Ctrl+C`, then run `docker compose -f demo/compose.yaml -f demo/rehearse.yaml down`.

