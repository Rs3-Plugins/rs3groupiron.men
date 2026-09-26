#!/usr/bin/env bash
#
# Activates an uploaded release. Runs on the server, invoked over SSH.
#
#   release.sh <release-id>
#
# Blue/green: the old colour keeps serving until the new one passes its health
# check. nginx reload is graceful, so the switch drops no connections.
set -euo pipefail

RELEASE_ID="${1:?usage: release.sh <release-id>}"
APP_ROOT=/srv/rs3
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"
BLUE_PORT=3001
GREEN_PORT=3002
HEALTH_TIMEOUT=90
KEEP_RELEASES=5

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[1;31m!!  %s\033[0m\n' "$*" >&2; exit 1; }

[[ -d "$RELEASE_DIR" ]] || fail "no such release: $RELEASE_DIR"
[[ -f "$APP_ROOT/shared/.env" ]] || fail "missing $APP_ROOT/shared/.env"

# ---------------------------------------------------------------- which colour
ACTIVE_FILE="$APP_ROOT/shared/active_color"
ACTIVE=$(cat "$ACTIVE_FILE" 2>/dev/null || echo none)
if [[ "$ACTIVE" == "blue" ]]; then
  TARGET=green; TARGET_PORT=$GREEN_PORT
else
  TARGET=blue;  TARGET_PORT=$BLUE_PORT
fi
log "active=$ACTIVE  deploying to=$TARGET (port $TARGET_PORT)"

# ---------------------------------------------------------------- env + wiring
# DATABASE_URL lives only on this box; the rendered .env never contains it.
DB_URL=$(cat "$APP_ROOT/shared/database_url")
grep -q '^DATABASE_URL=' "$APP_ROOT/shared/.env" \
  || echo "DATABASE_URL=$DB_URL" >>"$APP_ROOT/shared/.env"
chmod 600 "$APP_ROOT/shared/.env"

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current-$TARGET"

# ---------------------------------------------------------------- config drift
# Applying configure.sh needs root, and it comes from the repo — so automatic
# application means anyone who can push can run root commands here. Opt-in via
# the sudoers line; without it we only report the drift.
CONFIG_SRC="$RELEASE_DIR/deploy/configure.sh"
CONFIG_STAMP="$APP_ROOT/shared/configure.sha"
if [[ -f "$CONFIG_SRC" ]]; then
  # Everything configure.sh installs, not just the script — a panel edit is a
  # config change too.
  want=$(find "$RELEASE_DIR/deploy" -type f \
           \( -name 'configure.sh' -o -path '*/panel/*' \) -print0 2>/dev/null \
         | sort -z | xargs -0 cat 2>/dev/null | sha256sum | cut -d' ' -f1)
  have=$(cat "$CONFIG_STAMP" 2>/dev/null || echo none)
  if [[ "$want" != "$have" ]]; then
    if sudo -n /usr/local/bin/rs3-configure --check >/dev/null 2>&1; then
      log "Server configuration changed — applying"
      sudo /usr/local/bin/rs3-configure
      echo "$want" >"$CONFIG_STAMP"
    else
      warn_cfg="deploy/configure.sh changed but was NOT applied."
      printf '\n\033[1;33m!!  %s\033[0m\n' "$warn_cfg"
      echo "    Run on the server:  sudo bash $CONFIG_SRC"
      echo "    Or enable automatic config: see deploy/README.md"
    fi
  else
    log "Server configuration unchanged"
  fi
fi

# ---------------------------------------------------------------- migrations
# Before the switch, against the live database. Migrations here are additive,
# so the serving version keeps working. A destructive one would need expand/
# contract across two releases instead.
log "Applying migrations"
cd "$RELEASE_DIR/apps/api"
# Not sourced: sourcing .env executes it, so a value containing backticks would
# run as code. Prisma needs this one variable.
export DATABASE_URL="$DB_URL"
./node_modules/.bin/prisma migrate deploy || fail "migrations failed — nothing switched"

# ---------------------------------------------------------------- start target
log "Starting $TARGET"
sudo systemctl restart "rs3-api@$TARGET"

log "Waiting for health on 127.0.0.1:$TARGET_PORT (max ${HEALTH_TIMEOUT}s)"
healthy=0
for ((i = 0; i < HEALTH_TIMEOUT; i++)); do
  body=$(curl -fsS --max-time 3 "http://127.0.0.1:$TARGET_PORT/health" 2>/dev/null || true)
  if [[ -n "$body" ]]; then
    # /health is 200 even with the database down, so check the body.
    if echo "$body" | jq -e '.db.ok == true' >/dev/null 2>&1; then
      healthy=1
      echo "  healthy after ${i}s: $(echo "$body" | jq -c '.db')"
      break
    fi
  fi
  sleep 1
done

if [[ $healthy -ne 1 ]]; then
  log "Health check FAILED — rolling back"
  sudo systemctl stop "rs3-api@$TARGET" || true
  echo "--- last 40 log lines from $TARGET ---" >&2
  journalctl -u "rs3-api@$TARGET" -n 40 --no-pager >&2 || true
  fail "new release never became healthy; $ACTIVE left serving"
fi

# ---------------------------------------------------------------- switch
log "Switching nginx to $TARGET"
# This file is owned by the service user, so no sudo is needed to rewrite it.
# keepalive must be repeated here, not just in configure.sh: this line is
# rewritten on every release, so anything it omits is silently lost.
cat >/etc/nginx/conf.d/rs3-upstream.conf <<EOF
upstream rs3_api {
  server 127.0.0.1:$TARGET_PORT;
  keepalive 64;
  # Below the app's server.keepAliveTimeout (65s) on purpose; see configure.sh.
  keepalive_timeout 60s;
}
EOF
sudo /usr/sbin/nginx -t || fail "nginx config invalid; $ACTIVE still serving"
sudo systemctl reload nginx

echo "$TARGET" >"$ACTIVE_FILE"

# Let anything already in flight drain before the old process goes away.
if [[ "$ACTIVE" != "none" && "$ACTIVE" != "$TARGET" ]]; then
  log "Draining and stopping $ACTIVE"
  sleep 5
  sudo systemctl stop "rs3-api@$ACTIVE" || true
fi

sudo systemctl enable "rs3-api@$TARGET" >/dev/null 2>&1 || true

# ---------------------------------------------------------------- prune
log "Pruning old releases (keeping $KEEP_RELEASES)"
cd "$APP_ROOT/releases"
# Never delete whatever the two colour symlinks point at, even if it is old.
keep_blue=$(readlink -f "$APP_ROOT/current-blue" 2>/dev/null || echo)
keep_green=$(readlink -f "$APP_ROOT/current-green" 2>/dev/null || echo)
ls -1dt */ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)) | while read -r dir; do
  full=$(readlink -f "$dir")
  [[ "$full" == "$keep_blue" || "$full" == "$keep_green" ]] && continue
  rm -rf -- "$dir"
done

log "Deployed $RELEASE_ID on $TARGET"
