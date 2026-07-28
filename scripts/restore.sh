#!/usr/bin/env bash
# Postgres restore: streams a .sql.gz backup file (produced by backup.sh) into
# the running mcq_postgres container.
#
# Usage:  ./scripts/restore.sh <backup-file.sql.gz>
#
# ⚠ DESTRUCTIVE — the dump includes DROP TABLE statements. Confirm before running
# in production. Consider stopping app services first so no writes race with the
# restore:
#
#   docker compose stop api-gateway question-bank exam-generator exam-session result-engine dispute-manager
#   ./scripts/restore.sh backups/mcqdb-20260728T021500Z.sql.gz
#   docker compose start api-gateway question-bank exam-generator exam-session result-engine dispute-manager

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <backup-file.sql.gz>" >&2
  exit 2
fi

BACKUP_FILE="$1"
CONTAINER="${POSTGRES_CONTAINER:-mcq_postgres}"
DB_USER="${POSTGRES_USER:-mcquser}"
DB_NAME="${POSTGRES_DB:-mcqdb}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "[restore] file not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "[restore] about to restore $BACKUP_FILE into $DB_NAME in $CONTAINER"
echo "[restore] this will DROP existing tables. Ctrl-C to abort, Enter to continue."
read -r _

gunzip -c "$BACKUP_FILE" \
  | docker exec -i "$CONTAINER" psql \
      --username="$DB_USER" \
      --dbname="$DB_NAME" \
      --set ON_ERROR_STOP=on

echo "[restore] done."
