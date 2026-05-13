#!/usr/bin/env bash
# One-shot finan-app snapshot for server migrations. Captures the MongoDB
# database (mongodump archive — live-safe, no downtime) plus a redacted
# copy of .env and the docker-compose.yml in effect at backup time.
# Optionally pulls from a remote host via SSH.
#
# Usage:
#   ./scripts/backup.sh                                          # run on the host finan-app is on
#   ./scripts/backup.sh --from user@host:/path/to/finan-app      # ssh, back up, rsync down
#
# Output:
#   ./backups/finan-YYYYMMDD-HHMMSSZ.tar.gz
#
# Restore (target host, fresh repo checkout in place):
#   tar -xzf finan-*.tar.gz -C /tmp/finan-restore
#   cp /tmp/finan-restore/env.redacted .env
#   # hand-fill every <redacted> in .env (SECRET_TOKEN, RESEND_API_KEY, GOOGLE_*, SENTRY_*)
#   docker compose up -d mongo mongo-init
#   until docker exec finan-mongo mongosh --quiet --eval 'db.adminCommand("ping")' >/dev/null 2>&1; do sleep 1; done
#   docker exec -i finan-mongo mongorestore --archive --gzip --drop --nsInclude='finan.*' \
#     < /tmp/finan-restore/finan.archive.gz
#   docker compose up -d

set -euo pipefail

REMOTE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      REMOTE="${2:?--from needs user@host:/path}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "✖ unknown arg: $1" >&2
      exit 1
      ;;
  esac
done

# ---- Remote mode: SSH in, run ourselves there, rsync the tarball back ----
if [[ -n "$REMOTE" ]]; then
  HOST="${REMOTE%%:*}"
  REMOTE_PATH="${REMOTE#*:}"
  if [[ "$HOST" == "$REMOTE" || -z "$REMOTE_PATH" ]]; then
    echo "✖ --from must be user@host:/path/to/finan-app" >&2
    exit 1
  fi
  echo "==> remote backup on ${HOST} (path: ${REMOTE_PATH})"
  scp -q "$0" "${HOST}:/tmp/finan-backup.sh"
  ssh "$HOST" "cd '${REMOTE_PATH}' && bash /tmp/finan-backup.sh"
  REMOTE_TARBALL=$(ssh "$HOST" "ls -t '${REMOTE_PATH}'/backups/finan-*.tar.gz | head -1")
  mkdir -p ./backups
  echo "==> rsync ${HOST}:${REMOTE_TARBALL} → ./backups/"
  rsync -avz --progress "${HOST}:${REMOTE_TARBALL}" ./backups/
  ssh "$HOST" "rm -f /tmp/finan-backup.sh"
  echo "✓ remote backup landed in ./backups/$(basename "${REMOTE_TARBALL}")"
  exit 0
fi

# ---- Local mode ----
# Script lives in scripts/, but we operate from the repo root so paths are predictable.
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "✖ .env missing — run from the finan-app repo root (or its parent, via ./scripts/backup.sh)" >&2
  exit 1
fi

MONGO_CONTAINER="finan-mongo"
DB_NAME="finan"
STAMP=$(date -u +%Y%m%d-%H%M%SZ)
STAGE=$(mktemp -d 2>/dev/null || mktemp -d -t finan-backup)
OUT_DIR="./backups"
TARBALL="${OUT_DIR}/finan-${STAMP}.tar.gz"
mkdir -p "$OUT_DIR"

trap "rm -rf '$STAGE'" EXIT

echo "==> finan-app backup ${STAMP}"

# Mongo must be running — mongodump streams over the live socket.
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${MONGO_CONTAINER}\$"; then
  echo "✖ ${MONGO_CONTAINER} not running. Start mongo first: docker compose up -d mongo" >&2
  exit 1
fi

# mongodump --archive --gzip writes a single compressed stream to stdout, no
# intermediate files inside the container. WiredTiger snapshots are taken
# consistently per-collection; safe with concurrent writes.
echo "==> mongodump (db=${DB_NAME}) → stage"
docker exec "$MONGO_CONTAINER" mongodump --archive --gzip --db "$DB_NAME" \
  > "${STAGE}/finan.archive.gz"

# Redact secrets so a leaked tarball can't be replayed. The restorer fills
# these in by hand on the new host. We err on the side of redacting too much —
# DSN exposes the Sentry project, CLIENT_ID is technically public but treating
# it as opaque keeps the .env free of project-identifying strings.
echo "==> redact .env"
awk -F= '
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { print; next }
  $1 ~ /(SECRET|TOKEN|PASSWORD|KEY|CLIENT_ID|DSN)/ { print $1 "=<redacted>"; next }
  { print }
' .env > "${STAGE}/env.redacted"

# Snapshot the compose file too — useful when restoring on a server running a
# different revision of the repo. Diff against the new docker-compose.yml to
# spot service additions/removals (e.g. the retired `ai` service).
cp docker-compose.yml "${STAGE}/docker-compose.yml"

echo "==> pack ${TARBALL}"
tar -czf "$TARBALL" -C "$STAGE" .

SIZE=$(du -h "$TARBALL" | cut -f1)
echo "✓ ${TARBALL} (${SIZE})"
echo
echo "⚠ Move off-host before treating as backed up — local disk failure ≠ backup."
echo "  e.g. scp ${TARBALL} laptop:~/backups/"
