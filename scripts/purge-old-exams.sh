#!/usr/bin/env bash
# Hard-delete exams that have been in the soft-delete trash for longer than
# the retention window. Because Postgres FK cascades handle child rows
# (ExamQuestion, ExamHistory, ExamSession, Result, Dispute), this is a
# single DELETE.
#
# Usage:
#   ./scripts/purge-old-exams.sh [retention_days]
#     default retention_days = 30
#
# Cron example (nightly at 03:00):
#   0 3 * * *  /path/to/mcq-exam-system/scripts/purge-old-exams.sh >> /var/log/examforge-purge.log 2>&1

set -euo pipefail

RETENTION="${1:-30}"
CONTAINER="${POSTGRES_CONTAINER:-mcq_postgres}"
DB_USER="${POSTGRES_USER:-mcquser}"
DB_NAME="${POSTGRES_DB:-mcqdb}"

echo "[purge] deleting exams with deleted_at < NOW() - INTERVAL '${RETENTION} days'"

# Report first so the log has a clear before/after count.
BEFORE=$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -tA \
  -c "SELECT count(*) FROM exams WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '${RETENTION} days';")

echo "[purge] $BEFORE exam(s) match the purge criteria"

if [ "$BEFORE" -eq 0 ]; then
  exit 0
fi

docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
  -c "DELETE FROM exams WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '${RETENTION} days';"

# TODO: also unlink orphaned PDF files under EXAM_PAPERS_DIR — deferred until
# there's a real disk-usage complaint. DB is the source of truth.
echo "[purge] done."
