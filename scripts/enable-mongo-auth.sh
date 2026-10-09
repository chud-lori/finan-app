#!/usr/bin/env bash
# Finishes the MongoDB auth cutover on the finan-app host: points DB_URI at the
# credentialed connection string, recreates the stack, and proves auth is on.
# Rolls .env and docker-compose.yml back if the backend does not come up.
#
# The compose file must already carry --auth --keyFile and the keyfile mount,
# and the root/finan users must already exist. Run with no arguments to check.
set -euo pipefail

COMPOSE_DIR=${COMPOSE_DIR:-/opt/finan-app}
COMPOSE_FILE="$COMPOSE_DIR/docker-compose.yml"
ENV_FILE="$COMPOSE_DIR/.env"
BACKUP_ENV=${BACKUP_ENV:-/etc/finan-backup.env}
MONGO_CONTAINER=${MONGO_CONTAINER:-finan-mongo}
BACKEND_CONTAINER=${BACKEND_CONTAINER:-finan-be}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-120}

FINAN_PW=${MONGO_FINAN_PW:-}
ROOT_PW=${MONGO_ROOT_PW:-}
WRITE_BACKUP_ENV=0
CHECK_ONLY=0

say()  { printf '==> %s\n' "$*"; }
ok()   { printf '  ok  %s\n' "$*"; }
die()  { printf '  FAIL  %s\n' "$*" >&2; exit 1; }

usage() {
    cat <<'USAGE'
Usage: enable-mongo-auth.sh --finan-password PW [options]

  -f, --finan-password PW   password of the `finan` mongo user (the one the
                            backend connects as). Also read from MONGO_FINAN_PW.
  -r, --root-password PW    password of the `root` mongo user. Optional; used
                            only to verify an admin login still works.
                            Also read from MONGO_ROOT_PW.
      --backup-env          also write MONGO_BACKUP_URI to /etc/finan-backup.env
                            and run one backup. Needs write access to that file.
      --check               run the preflight checks and exit without changing
                            anything.
  -h, --help                this message.

Passing a password as an argument puts it in your shell history and in ps.
Prefer the environment variables, or let the script prompt:

  read -rs -p 'finan password: ' MONGO_FINAN_PW; echo; export MONGO_FINAN_PW
  ./enable-mongo-auth.sh
USAGE
}

while [ $# -gt 0 ]; do
    case "$1" in
        -f|--finan-password) FINAN_PW=${2:?missing value}; shift 2 ;;
        -r|--root-password)  ROOT_PW=${2:?missing value}; shift 2 ;;
        --backup-env)        WRITE_BACKUP_ENV=1; shift ;;
        --check)             CHECK_ONLY=1; shift ;;
        -h|--help)           usage; exit 0 ;;
        *)                   usage >&2; die "unknown argument: $1" ;;
    esac
done

# mongosh echoes its prompt into piped output, so every check below prints a
# marker and the marker is what gets matched, never the bare result.
mongo_eval() { docker exec -i "$MONGO_CONTAINER" mongosh --quiet; }
marker()     { sed -n "s/.*$1://p" | tr -d '\r' | head -1; }

say "preflight"
[ -f "$COMPOSE_FILE" ] || die "$COMPOSE_FILE not found"
[ -w "$ENV_FILE" ]     || die "$ENV_FILE is not writable by $(id -un)"
grep -q -- '--keyFile' "$COMPOSE_FILE" || die "compose has no --keyFile; the mongo command was never edited"
grep -q -- '--auth'    "$COMPOSE_FILE" || die "compose has no --auth"
grep -q '/etc/mongo/keyfile:ro' "$COMPOSE_FILE" || die "keyfile is not mounted into the mongo container"
grep -q 'authenticationDatabase' "$COMPOSE_FILE" || die "mongo-init has no credentials; it will fail once auth is on"
docker inspect "$MONGO_CONTAINER" >/dev/null 2>&1 || die "$MONGO_CONTAINER is not running"
ok "compose is ready for auth"

users=$(printf 'print("USERS:" + db.getSiblingDB("admin").system.users.find({},{user:1,_id:0}).toArray().map(u => u.user).join(","))\n' | mongo_eval | marker USERS)
case "$users" in
    *finan*) ok "mongo users present: $users" ;;
    *)       die "the finan user does not exist yet (found: ${users:-none})" ;;
esac

if [ "$CHECK_ONLY" -eq 1 ]; then
    say "check only, nothing changed"
    exit 0
fi

if [ -z "$FINAN_PW" ]; then
    read -rs -p "password for the finan mongo user: " FINAN_PW; echo
fi
[ -n "$FINAN_PW" ] || die "no finan password given"

# Verify the password before it is written anywhere, while auth is still off and
# a wrong one costs nothing.
say "checking the finan password"
probe=$(printf 'try { const c = connect("mongodb://finan:%s@localhost:27017/finan?authSource=admin"); print("AUTH_OK") } catch (e) { print("AUTH_BAD") }\n' \
        "$FINAN_PW" | mongo_eval || true)
case "$probe" in
    *AUTH_OK*)  ok "password accepted" ;;
    *)          die "mongo rejected that password for user finan" ;;
esac

say "writing DB_URI"
cp -p "$ENV_FILE" "$ENV_FILE.bak-preauth"
sed -i '/^DB_URI=/d' "$ENV_FILE"
printf 'DB_URI=mongodb://finan:%s@mongo:27017/finan?replicaSet=rs0&authSource=admin\n' "$FINAN_PW" >> "$ENV_FILE"
[ "$(grep -c '^DB_URI=' "$ENV_FILE")" = "1" ] || die "DB_URI is not exactly one line"
ok "DB_URI set (backup at $ENV_FILE.bak-preauth)"

rollback() {
    say "ROLLING BACK"
    mv -f "$ENV_FILE.bak-preauth" "$ENV_FILE"
    [ -f "$COMPOSE_FILE.bak-preauth" ] && cp -p "$COMPOSE_FILE.bak-preauth" "$COMPOSE_FILE"
    ( cd "$COMPOSE_DIR" && docker compose up -d --remove-orphans )
    die "rolled back to the pre-auth configuration; the app should be serving again"
}

say "recreating the stack"
( cd "$COMPOSE_DIR" && docker compose up -d --remove-orphans ) || rollback

say "waiting for $BACKEND_CONTAINER to report healthy (up to ${HEALTH_TIMEOUT}s)"
deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$BACKEND_CONTAINER" 2>/dev/null)" = "healthy" ]; do
    [ "$(date +%s)" -lt "$deadline" ] || { docker logs --tail 30 "$BACKEND_CONTAINER" || true; rollback; }
    sleep 3
done
ok "backend healthy"

# The whole point of the exercise: an anonymous read must now be refused.
say "proving auth is enforced"
anon=$(printf 'print("ANON:" + db.getSiblingDB("finan").transactions.countDocuments())\n' | mongo_eval 2>&1 | marker ANON || true)
if printf '%s' "$anon" | grep -qE '^[0-9]+$'; then
    printf '  FAIL  anonymous read returned %s documents; auth is NOT enforced\n' "$anon" >&2
    rollback
fi
ok "anonymous read refused"

count=$(printf 'const c = connect("mongodb://finan:%s@localhost:27017/finan?authSource=admin"); print("COUNT:" + c.transactions.countDocuments())\n' \
        "$FINAN_PW" | mongo_eval | marker COUNT)
[ -n "$count" ] || rollback
ok "authenticated read works: $count transactions"

if [ -n "$ROOT_PW" ]; then
    r=$(printf 'try { connect("mongodb://root:%s@localhost:27017/admin"); print("ROOT_OK") } catch (e) { print("ROOT_BAD") }\n' \
        "$ROOT_PW" | mongo_eval || true)
    case "$r" in *ROOT_OK*) ok "root login works" ;; *) printf '  warn  root password was rejected\n' ;; esac
fi

if [ "$WRITE_BACKUP_ENV" -eq 1 ]; then
    say "pointing the backup at the credentialed URI"
    [ -w "$BACKUP_ENV" ] || die "$BACKUP_ENV is not writable; re-run this part with sudo"
    cp -p "$BACKUP_ENV" "$BACKUP_ENV.bak-preauth"
    sed -i '/^MONGO_BACKUP_URI=/d' "$BACKUP_ENV"
    printf 'MONGO_BACKUP_URI=mongodb://finan:%s@localhost:27017/finan?authSource=admin\n' "$FINAN_PW" >> "$BACKUP_ENV"
    systemctl start finan-backup.service
    ok "backup ran; newest archive:"
    ls -lht /var/backups/finan/ | sed -n '2p'
fi

say "done"
docker compose -f "$COMPOSE_FILE" ps
