#!/usr/bin/env bash
# Postgres backup: dumps the mcqdb database from the running mcq_postgres
# container into a timestamped .sql.gz file under ./backups/.
#
# Usage:  ./scripts/backup.sh [output_dir]
#         default output_dir = ./backups
#
# Cron example (daily at 02:15, keep 14 days of backups):
#   15 2 * * *  /path/to/mcq-exam-system/scripts/backup.sh && find /path/to/mcq-exam-system/backups -type f -name '*.sql.gz' -mtime +14 -delete
#
# For real prod you should also `aws s3 cp` (or equivalent) the resulting file
# to off-host storage — the script writes locally only. See DEPLOY.md.

set -euo pipefail

OUT_DIR="${1:-./backups}"
CONTAINER="${POSTGRES_CONTAINER:-mcq_postgres}"
DB_USER="${POSTGRES_USER:-mcquser}"
DB_NAME="${POSTGRES_DB:-mcqdb}"

mkdir -p "$OUT_DIR"
TS=$(date -u +'%Y%m%dT%H%M%SZ')
OUT_FILE="$OUT_DIR/mcqdb-${TS}.sql.gz"

echo "[backup] dumping $DB_NAME from $CONTAINER → $OUT_FILE"

# --clean + --if-exists so the dump can be restored on top of an existing DB.
docker exec "$CONTAINER" pg_dump \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --format=plain \
  --clean --if-exists \
  --no-owner --no-privileges \
  | gzip -9 > "$OUT_FILE"

SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "[backup] wrote $OUT_FILE ($SIZE)"
