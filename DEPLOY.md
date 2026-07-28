# ExamForge — Production Deployment Runbook

Concrete, opinionated instructions for a single-host Docker deploy of ExamForge.

> If you outgrow single-host, migrate to Kubernetes (out of scope here) — the
> code doesn't need changes, only the compose file translates to k8s manifests.

---

## Prerequisites

- Linux host with Docker Engine ≥ 24 and Docker Compose plugin
- 2 CPU / 4 GB RAM minimum (Puppeteer needs headroom)
- Domain name + TLS terminator in front (Caddy / nginx / Cloudflare — this stack does NOT terminate TLS)
- Ports 80/443 open on the host (only these; the app itself binds to 3000 which the reverse proxy forwards to)
- SMTP / Sentry / S3 credentials if you use those features

---

## First-time setup

### 1. Clone + configure

```bash
git clone <your-fork> examforge && cd examforge

# Create the prod env file. Copy from the template and fill in real values.
cp .env.example .env.prod
```

Edit `.env.prod` and set at least:

```env
NODE_ENV=production
JWT_SECRET=$(openssl rand -base64 48)                # generate fresh
SESSION_JWT_SECRET=$(openssl rand -base64 48)        # generate fresh, DIFFERENT from JWT_SECRET
DATABASE_URL=postgresql://mcquser:<strong-password>@postgres:5432/mcqdb
FRONTEND_ORIGIN=https://your-domain.example.com
# SENTRY_DSN=https://xxx@sentry.io/xxx               # optional
```

> `NODE_ENV=production` causes each service to fail at boot if `JWT_SECRET` /
> `DATABASE_URL` are missing or set to a known dev default. This is intentional
> — it prevents accidentally deploying with dev secrets.

The base compose file expects `mcquser` / `mcqpassword` for Postgres. To rotate
the DB password, edit `docker-compose.yml` `postgres.environment.POSTGRES_PASSWORD`
AND `.env.prod` `DATABASE_URL` to match, THEN wipe the postgres volume (only
safe on first-time setup — otherwise see "Rotate DB password" below).

### 2. First boot

```bash
docker compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  up -d
```

What happens:

1. `postgres` + `redis` come up healthy
2. `migrator` runs `prisma migrate deploy` and exits (0)
3. Backend services (`api-gateway`, `question-bank`, etc.) start; each depends on migrator having completed
4. `frontend` starts after `api-gateway` is healthy

Watch it come up:

```bash
docker compose ps
docker compose logs -f migrator     # confirms migrations ran
```

Everything should be `(healthy)` within ~60s.

### 3. Verify

```bash
curl https://your-domain.example.com/health
curl https://your-domain.example.com/ready
```

Both should return `{"status":"ok",...}`. `/ready` additionally confirms DB
connectivity.

### 4. Create the first teacher account

The registration endpoint is public (rate-limited to 5/10min per IP). Curl or
use the frontend registration page:

```bash
curl -X POST https://your-domain.example.com/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@school.example","password":"<strong>","name":"Admin","role":"TEACHER"}'
```

---

## Reverse proxy

The app listens on `:3000` (api) and `:8080` (frontend) on the host. Terminate
TLS at your reverse proxy and forward:

- `https://your-domain.example.com/`         → `http://localhost:8080` (frontend static files)
- `https://your-domain.example.com/api/*`    → `http://localhost:3000` (strip `/api` prefix)
- (or serve the frontend and API on separate subdomains and set `FRONTEND_ORIGIN` to include both)

Example Caddyfile:

```caddy
your-domain.example.com {
    handle_path /api/* {
        reverse_proxy localhost:3000
    }
    handle {
        reverse_proxy localhost:8080
    }
}
```

---

## Ongoing operations

### Deploying an update

```bash
git pull
docker compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  build

# Rolling replace — migrator runs, then services swap in one-by-one.
docker compose --env-file .env.prod \
  -f docker-compose.yml -f docker-compose.prod.yml \
  up -d
```

Compose recreates only the containers whose image hash changed. Migrations are
applied by the `migrator` service on every `up`; safe because Prisma tracks
what's been applied.

### Backups

Daily backup (cron on the host):

```cron
15 2 * * *  cd /path/to/examforge && ./scripts/backup.sh >> /var/log/examforge-backup.log 2>&1
15 3 * * *  find /path/to/examforge/backups -type f -name '*.sql.gz' -mtime +14 -delete
```

Sync off-host (do this — a local backup is not a backup):

```bash
aws s3 sync backups/ s3://your-bucket/examforge-backups/ --exclude '*' --include '*.sql.gz'
```

### Restoring from backup

```bash
# Stop app services so they don't race with the restore
docker compose stop api-gateway question-bank exam-generator exam-session result-engine dispute-manager

# Restore (interactive — confirms before DROP)
./scripts/restore.sh backups/mcqdb-20260728T021500Z.sql.gz

# Bring services back up
docker compose start api-gateway question-bank exam-generator exam-session result-engine dispute-manager
```

### Rotate a secret

1. Generate new value: `openssl rand -base64 48`
2. Update `.env.prod`
3. `docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d`

Note: rotating `JWT_SECRET` invalidates all existing teacher sessions (they'll be
logged out). Rotating `SESSION_JWT_SECRET` invalidates all in-progress student
exam sessions — do this only during a maintenance window.

### Rotate DB password (without data loss)

```bash
# 1. Connect to postgres and change the role password
docker exec -it mcq_postgres psql -U mcquser -d mcqdb \
  -c "ALTER USER mcquser WITH PASSWORD '<new-strong-password>';"

# 2. Update .env.prod DATABASE_URL to use the new password

# 3. Restart everything (services read DATABASE_URL on boot)
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Manual migrations

The `migrator` service runs migrations on every `up`, but you can also run them
directly:

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm migrator
```

### Viewing logs

```bash
# One service
docker compose logs -f api-gateway

# All services, correlated by request ID
docker compose logs -f --tail=100 | grep '"reqId":"<trace-id>"'
```

### Metrics

`/metrics` is exposed on the gateway (and internally on each service). Scrape
with Prometheus from another host:

```yaml
scrape_configs:
  - job_name: examforge-gateway
    static_configs:
      - targets: ["your-host:3000"]
```

Key metrics:

- `http_requests_total{service,method,route,status}`
- `http_request_duration_seconds_bucket{...}` — for p95/p99 alerts
- `queue_jobs{queue,state}` — alert if `state="failed"` grows or `state="waiting"` stays > 0 for long

---

## Troubleshooting

### Service won't start, logs show `[env] FATAL: ...`

You either haven't set a required env var in `.env.prod`, or you're still using
a dev-default secret (`dev-only-jwt-secret-do-not-use-in-prod` etc). Rotate it.

### Volume permission denied (EACCES)

If you're upgrading from a pre-4.1 install, the named volumes were created
under root. Chown them once:

```bash
docker compose down
for v in exam_papers_data question_images_data uploads_data; do
  docker run --rm -u 0 -v mcq-exam-system_$v:/data alpine chown -R 1000:1000 /data
done
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### PDF generation stuck in PENDING

Check the worker log:

```bash
docker compose logs exam-generator | grep -i "pdf"
```

Common causes: Puppeteer OOM (increase memory limit in prod overlay), or
question-bank returned a non-PDF (bad exam composition — check its log).

### Migrations fail

```bash
docker compose logs migrator
```

Read the Prisma error. Usually it's a schema conflict (someone edited a
migration file). Roll back to the previous release and investigate before
re-deploying.

---

## What's NOT covered here

- **Multi-host / k8s** — this doc is single-host only
- **TLS termination** — assumed handled by reverse proxy in front
- **CDN for static assets** — the frontend serves via nginx on port 8080; put a CDN in front if you're serving to many users
- **CI/CD** — add your own GitHub Actions / GitLab CI; the build steps are `docker compose build` and `docker compose up -d`
- **Multi-tenancy** — per-org isolation is at the ownership layer (Phase 1); no per-org DB partitioning
