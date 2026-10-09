#!/usr/bin/env bash
# Daily mongodump of finan-mongo with local retention and an optional rclone upload.
# Run by finan-backup.service as root; every setting comes from env (see backup.env.example).
#
# Usage:
#   sudo systemctl start finan-backup.service    # manual run with /etc/finan-backup.env applied
#   sudo /usr/local/sbin/finan-backup-mongo      # or directly, defaults only
#
# Output:
#   $BACKUP_DIR/finan-YYYYMMDD-HHMMSSZ.archive.gz    (mongodump --archive --gzip)

set -euo pipefail

MONGO_CONTAINER="${MONGO_CONTAINER:-finan-mongo}"
MONGO_DB="${MONGO_DB:-finan}"
MONGO_BACKUP_URI="${MONGO_BACKUP_URI:-}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/finan}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-}"
BACKUP_DISCORD_WEBHOOK="${BACKUP_DISCORD_WEBHOOK:-}"

STAMP=$(date -u +%Y%m%d-%H%M%SZ)
FINAL="${BACKUP_DIR}/finan-${STAMP}.archive.gz"
PARTIAL="${BACKUP_DIR}/.finan-${STAMP}.archive.gz.partial"

notify_failure() {
  local code=$?
  rm -f "$PARTIAL"
  [[ $code -eq 0 ]] && return 0
  echo "✖ backup failed (exit ${code})" >&2
  if [[ -n "$BACKUP_DISCORD_WEBHOOK" ]]; then
    # The URL goes through curl's config on a pipe so it never shows in `ps`.
    # Alert delivery is best-effort; the non-zero exit below is what systemd records.
    curl -fsS --max-time 10 -K <(printf 'url = "%s"\n' "$BACKUP_DISCORD_WEBHOOK") \
      -H 'Content-Type: application/json' \
      -d "{\"content\":\"finan backup FAILED on $(hostname) (exit ${code}). Check: journalctl -u finan-backup\"}" \
      >/dev/null 2>&1 || echo "⚠ Discord alert could not be sent" >&2
  fi
  exit "$code"
}
trap notify_failure EXIT
# Without this, a systemd timeout kill reaches the EXIT trap with $? = 0 and skips the alert.
trap 'exit 143' INT TERM

if ! [[ "$BACKUP_RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]]; then
  echo "✖ BACKUP_RETENTION_DAYS must be a positive integer, got '${BACKUP_RETENTION_DAYS}'" >&2
  exit 1
fi

if [[ "$(docker inspect -f '{{.State.Running}}' "$MONGO_CONTAINER" 2>/dev/null)" != "true" ]]; then
  echo "✖ container ${MONGO_CONTAINER} is not running" >&2
  exit 1
fi

umask 077
mkdir -p "$BACKUP_DIR"

echo "==> mongodump ${MONGO_CONTAINER} (db=${MONGO_DB}) → ${FINAL}"
if [[ -n "$MONGO_BACKUP_URI" ]]; then
  # The URI reaches mongodump as a config file on stdin, so the password is in no process's argv.
  # --quiet stays on this path because mongodump's connection errors echo the full URI, password included.
  docker exec -e MONGO_BACKUP_URI "$MONGO_CONTAINER" \
    sh -c 'printf "uri: \"%s\"\n" "$MONGO_BACKUP_URI" | exec mongodump --config=/dev/stdin --db="$1" --archive --gzip --quiet' \
    _ "$MONGO_DB" > "$PARTIAL"
else
  docker exec "$MONGO_CONTAINER" mongodump --db="$MONGO_DB" --archive --gzip > "$PARTIAL"
fi

if [[ ! -s "$PARTIAL" ]]; then
  echo "✖ dump is empty" >&2
  exit 1
fi
gzip -t "$PARTIAL"
mv "$PARTIAL" "$FINAL"
echo "✓ $(du -h "$FINAL" | cut -f1) ${FINAL}"

# Prune runs only after a good dump, so a broken run never eats the last good backups.
echo "==> prune local backups older than ${BACKUP_RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'finan-*.archive.gz' \
  -mmin +"$((BACKUP_RETENTION_DAYS * 1440))" -print -delete

if [[ -n "$BACKUP_RCLONE_REMOTE" ]]; then
  echo "==> upload to ${BACKUP_RCLONE_REMOTE}"
  rclone copy --no-traverse "$FINAL" "$BACKUP_RCLONE_REMOTE"
  echo "✓ uploaded"
else
  echo "⚠ BACKUP_RCLONE_REMOTE not set — backup is on this host only" >&2
fi
