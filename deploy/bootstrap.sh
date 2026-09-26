#!/usr/bin/env bash
#
# One-time server setup for the RS3 Group Ironman API + Postgres.
# Safe to re-run: every step checks before acting.
#
#   sudo bash deploy/bootstrap.sh
#
# Afterwards the box has:
#   - a non-login `rs3` service user owning /srv/rs3
#   - PostgreSQL 18, listening on localhost only, scram-sha-256, tuned for this
#     machine's RAM, with pg_stat_statements enabled
#   - Node 24 for running the prebuilt API
#   - nginx on 127.0.0.1:8080 as the blue/green switch (not public)
#   - cloudflared, which dials out to Cloudflare so no inbound port is open
#   - a nightly pg_dump with retention
#
# It deliberately does NOT open any inbound port except SSH: Cloudflare Tunnel
# is outbound-only, so the API is reachable without exposing anything.
set -euo pipefail

APP_USER=rs3
APP_ROOT=/srv/rs3
DB_NAME=rs3_gim
DB_USER=rs3
PG_VERSION=18
NODE_MAJOR=24
BLUE_PORT=3001
GREEN_PORT=3002
PROXY_PORT=8080
STATS_PORT=8081

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "run as root: sudo bash $0" >&2
  exit 1
fi

# ---------------------------------------------------------------- base system
log "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  ufw fail2ban unattended-upgrades \
  nginx rsync jq goaccess apache2-utils rclone

log "Unattended security upgrades"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# ---------------------------------------------------------------- firewall
# Default-deny inbound. SSH is the only thing allowed in; the tunnel and
# Postgres are both reached without crossing the firewall.
log "Firewall (default deny inbound, SSH only)"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable
ufw status verbose

# ---------------------------------------------------------------- kernel limits
# nginx talks to the app over loopback, so a busy API churns through local ports
# and listen backlog far faster than a typical web server. The defaults are
# sized for a desktop.
log "Kernel network limits"
cat >/etc/sysctl.d/80-rs3.conf <<'EOF'
# Managed by deploy/bootstrap.sh

# Accept queue. The default 4096 is usually fine, but a connection burst that
# overflows it is dropped silently and looks like packet loss to the client.
net.core.somaxconn = 16384
net.ipv4.tcp_max_syn_backlog = 16384

# Every nginx -> node request takes an ephemeral port. With keepalive enabled
# this matters much less, but a restart still releases thousands at once.
net.ipv4.ip_local_port_range = 10240 65535
net.ipv4.tcp_tw_reuse = 1

# Long-lived SSE streams: notice a dead peer in ~2 minutes rather than ~2 hours,
# so sockets for closed laptops are reclaimed instead of counting against the
# connection limit.
net.ipv4.tcp_keepalive_time = 60
net.ipv4.tcp_keepalive_intvl = 20
net.ipv4.tcp_keepalive_probes = 3

fs.file-max = 262144
EOF
sysctl --system >/dev/null
sysctl net.core.somaxconn net.ipv4.ip_local_port_range

log "fail2ban for SSH"
cat >/etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
bantime = 1h
findtime = 10m
EOF
systemctl enable --now fail2ban

# ---------------------------------------------------------------- service user
log "Service user: $APP_USER"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  # Needs a real shell because GitHub Actions runs the release script over SSH
  # as this user. The password is locked, so key auth is the only way in.
  adduser --disabled-password --gecos '' --home "$APP_ROOT" --shell /bin/bash "$APP_USER"
fi
passwd -l "$APP_USER" >/dev/null
mkdir -p "$APP_ROOT/.ssh"
touch "$APP_ROOT/.ssh/authorized_keys"
chown -R "$APP_USER:$APP_USER" "$APP_ROOT/.ssh"
chmod 700 "$APP_ROOT/.ssh"
chmod 600 "$APP_ROOT/.ssh/authorized_keys"
mkdir -p "$APP_ROOT"/{releases,shared,backups}
chown -R "$APP_USER:$APP_USER" "$APP_ROOT"
# 751, not 750: nginx (www-data) must traverse this directory to serve the
# GoAccess report from $APP_ROOT/goaccess. The extra bit grants traverse only —
# not list, not read — and shared/ and backups/ below stay 700, so the .env,
# the database password and the dumps remain unreadable to anyone else.
chmod 751 "$APP_ROOT"
chmod 700 "$APP_ROOT/shared" "$APP_ROOT/backups"

# ---------------------------------------------------------------- node
log "Node $NODE_MAJOR"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}.* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
node -v

# ---------------------------------------------------------------- postgres
log "PostgreSQL $PG_VERSION"
if ! command -v psql >/dev/null 2>&1; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    >/etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq "postgresql-${PG_VERSION}" "postgresql-contrib-${PG_VERSION}"
fi

PG_CONF_DIR="/etc/postgresql/${PG_VERSION}/main"
if [[ ! -d "$PG_CONF_DIR" ]]; then
  warn "expected $PG_CONF_DIR — is PostgreSQL $PG_VERSION installed?"
  exit 1
fi

log "PostgreSQL tuning"
# Sized from actual RAM rather than guessed. These are the standard starting
# ratios; the API is a small OLTP workload so the defaults matter less than
# making sure shared_buffers and cache estimates are not Postgres' tiny
# out-of-the-box values.
TOTAL_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
CPUS=$(nproc)
SHARED_BUFFERS_MB=$((TOTAL_MB / 4))
EFFECTIVE_CACHE_MB=$((TOTAL_MB * 3 / 4))
MAINT_WORK_MEM_MB=$((TOTAL_MB / 16))
[[ $MAINT_WORK_MEM_MB -gt 2048 ]] && MAINT_WORK_MEM_MB=2048
WORK_MEM_MB=8

# Must exist before the config is written into it. Debian ships this directory,
# but creating it first keeps the script working on a layout that does not.
mkdir -p "${PG_CONF_DIR}/conf.d"
grep -q "include_dir = 'conf.d'" "${PG_CONF_DIR}/postgresql.conf" \
  || echo "include_dir = 'conf.d'" >>"${PG_CONF_DIR}/postgresql.conf"

cat >"${PG_CONF_DIR}/conf.d/10-rs3.conf" <<EOF
# Managed by deploy/bootstrap.sh — edit there, not here.

# The API runs on this same host, so never accept a network connection.
listen_addresses = 'localhost'
max_connections = 100

shared_buffers = ${SHARED_BUFFERS_MB}MB
effective_cache_size = ${EFFECTIVE_CACHE_MB}MB
maintenance_work_mem = ${MAINT_WORK_MEM_MB}MB
work_mem = ${WORK_MEM_MB}MB

# NVMe: random reads cost about the same as sequential, so stop the planner
# avoiding index scans.
random_page_cost = 1.1
effective_io_concurrency = 200

wal_compression = on
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB

# Parallelism scaled to the box.
max_worker_processes = ${CPUS}
max_parallel_workers = ${CPUS}
max_parallel_workers_per_gather = $(( CPUS / 2 > 0 ? CPUS / 2 : 1 ))

# Modern hashing only; md5 is no longer acceptable.
password_encryption = scram-sha-256

# Query statistics — the view that answers "which query is actually slow".
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.track = all

# Anything slower than a second is worth a log line.
log_min_duration_statement = 1000
log_checkpoints = on
log_connections = off
log_lock_waits = on
log_line_prefix = '%m [%p] %q%u@%d '
EOF

log "PostgreSQL authentication (local socket + loopback, scram only)"
cat >"${PG_CONF_DIR}/pg_hba.conf" <<'EOF'
# Managed by deploy/bootstrap.sh
local   all   postgres                 peer
local   all   all                      scram-sha-256
host    all   all   127.0.0.1/32       scram-sha-256
host    all   all   ::1/128            scram-sha-256
EOF

systemctl enable postgresql
systemctl restart postgresql

log "Database and role"
DB_PASS_FILE="$APP_ROOT/shared/db_password"
if [[ ! -f "$DB_PASS_FILE" ]]; then
  # Generated here and never printed, so it exists only on this box.
  openssl rand -base64 36 | tr -d '\n/+=' | head -c 40 >"$DB_PASS_FILE"
  chown "$APP_USER:$APP_USER" "$DB_PASS_FILE"
  chmod 600 "$DB_PASS_FILE"
fi
DB_PASS=$(cat "$DB_PASS_FILE")

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  ELSE
    ALTER ROLE ${DB_USER} PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL

if ! sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
fi

# The app owns its own schema but gets nothing else, and PUBLIC loses the
# ability to create objects in it.
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" <<SQL
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT ALL ON SCHEMA public TO ${DB_USER};
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SQL

echo "postgresql://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}?schema=public" \
  >"$APP_ROOT/shared/database_url"
chown "$APP_USER:$APP_USER" "$APP_ROOT/shared/database_url"
chmod 600 "$APP_ROOT/shared/database_url"

# ---------------------------------------------------- re-appliable config
# nginx, the panel, systemd units and timers live in configure.sh so that a
# deploy can re-apply them without touching apt, the firewall or Postgres.
log "Applying server configuration"
bash "$(dirname "$(readlink -f "$0")")/configure.sh"

log "Scoped sudo for deploys"
# Exactly the commands release.sh needs and nothing else — no blanket NOPASSWD.
# A compromised deploy key can restart the API; it cannot become root.
cat >/etc/sudoers.d/rs3-deploy <<EOF
${APP_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl start rs3-api@blue, \\
  /usr/bin/systemctl start rs3-api@green, \\
  /usr/bin/systemctl stop rs3-api@blue, \\
  /usr/bin/systemctl stop rs3-api@green, \\
  /usr/bin/systemctl restart rs3-api@blue, \\
  /usr/bin/systemctl restart rs3-api@green, \\
  /usr/bin/systemctl enable rs3-api@blue, \\
  /usr/bin/systemctl enable rs3-api@green, \\
  /usr/bin/systemctl reload nginx, \\
  /usr/sbin/nginx -t
EOF
chmod 440 /etc/sudoers.d/rs3-deploy
visudo -cf /etc/sudoers.d/rs3-deploy

# Wrapper a deploy can call to re-apply configure.sh from the live release.
# Installed either way; whether the deploy user may run it is decided by the
# opt-in sudoers file below, which is NOT created by default.
cat >/usr/local/bin/rs3-configure <<EOF
#!/usr/bin/env bash
set -euo pipefail
# --check lets release.sh test permission without doing anything.
[[ "\${1:-}" == "--check" ]] && exit 0
COLOR=\$(cat ${APP_ROOT}/shared/active_color 2>/dev/null || echo blue)
exec bash "${APP_ROOT}/current-\${COLOR}/deploy/configure.sh"
EOF
chmod 755 /usr/local/bin/rs3-configure

cat >/etc/sudoers.d/rs3-autoconfig.disabled <<EOF
# Enable with:
#   sudo mv /etc/sudoers.d/rs3-autoconfig.disabled /etc/sudoers.d/rs3-autoconfig
#
# This lets a deploy re-apply nginx, systemd units and the panel automatically.
# Understand the trade: configure.sh comes from the repo, so enabling this gives
# anyone who can push to the production branch the ability to run commands as
# root on this machine. Without it, a deploy can only restart the API.
${APP_USER} ALL=(root) NOPASSWD: /usr/local/bin/rs3-configure
EOF
chmod 440 /etc/sudoers.d/rs3-autoconfig.disabled

# ---------------------------------------------------------------- cloudflared
log "cloudflared"
if ! command -v cloudflared >/dev/null 2>&1; then
  mkdir -p --mode=0755 /usr/share/keyrings
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
    -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
https://pkg.cloudflare.com/cloudflared any main" \
    >/etc/apt/sources.list.d/cloudflared.list
  apt-get update -qq
  apt-get install -y -qq cloudflared
fi

# ---------------------------------------------------------------- backups
log "Nightly database backup"
cat >/usr/local/bin/rs3-backup <<EOF
#!/usr/bin/env bash
#
# Nightly database dump, kept locally and copied off-box to Cloudflare R2.
#
# The database is the only thing on this machine worth backing up: code and
# config are in git, .env is regenerated from GitHub secrets, and the passwords
# are regenerated by bootstrap.sh on a fresh host. What exists nowhere else is
# group tokens, inventories and the XP history.
set -euo pipefail

DEST=${APP_ROOT}/backups
ENV_FILE=${APP_ROOT}/shared/.env
STAMP=\$(date -u +%Y%m%dT%H%M%SZ)
FILE="\$DEST/${DB_NAME}-\$STAMP.dump"

export PGPASSWORD="\$(cat ${APP_ROOT}/shared/db_password)"
pg_dump -h 127.0.0.1 -U ${DB_USER} -d ${DB_NAME} -Fc -f "\$FILE"
# Keep two weeks locally; a dump of this database is small.
find "\$DEST" -name '${DB_NAME}-*.dump' -mtime +14 -delete

# Read single keys rather than sourcing the file: sourcing executes it, so a
# value containing backticks would run as root. Same reason release.sh stopped.
envget() { sed -n "s/^\$1=//p" "\$ENV_FILE" 2>/dev/null | head -1; }

ACCOUNT=\$(envget R2_ACCOUNT_ID)
KEY=\$(envget R2_ACCESS_KEY_ID)
SECRET=\$(envget R2_SECRET_ACCESS_KEY)
BUCKET=\$(envget R2_BACKUP_BUCKET)
PUBLIC_BUCKET=\$(envget R2_BUCKET)

if [[ -z "\$BUCKET" || -z "\$ACCOUNT" || -z "\$KEY" || -z "\$SECRET" ]]; then
  echo "R2 not configured (need R2_BACKUP_BUCKET + credentials) — local dump only"
  exit 0
fi

# Hard stop: R2_BUCKET is public behind CDN_BASE_URL. A dump holds every
# group's token, so uploading there would publish them.
if [[ "\$BUCKET" == "\$PUBLIC_BUCKET" ]]; then
  echo "REFUSING: R2_BACKUP_BUCKET is the public CDN bucket (\$BUCKET)." >&2
  echo "Create a separate private bucket for backups." >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "rclone not installed — local dump only" >&2
  exit 0
fi

# Config via environment, so no credentials are written to a second file.
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="\$KEY"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="\$SECRET"
export RCLONE_CONFIG_R2_ENDPOINT="https://\$ACCOUNT.r2.cloudflarestorage.com"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

rclone copy "\$FILE" "R2:\$BUCKET/db/" --s3-no-head --retries 3
# Prove it landed rather than trusting a zero exit code.
if rclone lsf "R2:\$BUCKET/db/\$(basename "\$FILE")" >/dev/null 2>&1; then
  echo "uploaded \$(basename "\$FILE") to R2:\$BUCKET/db/"
else
  echo "upload reported success but the object is not listable" >&2
  exit 1
fi

# Keep a month off-box — longer than local, since this is the copy that
# survives losing the machine.
rclone delete "R2:\$BUCKET/db/" --min-age 30d || true
EOF
chmod 750 /usr/local/bin/rs3-backup
chown root:"$APP_USER" /usr/local/bin/rs3-backup

cat >/etc/systemd/system/rs3-backup.service <<EOF
[Unit]
Description=RS3 database backup
[Service]
Type=oneshot
User=${APP_USER}
ExecStart=/usr/local/bin/rs3-backup
EOF

cat >/etc/systemd/system/rs3-backup.timer <<'EOF'
[Unit]
Description=Nightly RS3 database backup
[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now rs3-backup.timer

# ---------------------------------------------------------------- done
log "Bootstrap complete"
cat <<EOF

Still to do by hand (each needs a secret only you have):

1. Cloudflare Tunnel
     cloudflared service install <YOUR_TUNNEL_TOKEN>
   Then in the Cloudflare dashboard point the tunnel's public hostname
   (e.g. api.rs3groupiron.men) at:  http://127.0.0.1:${PROXY_PORT}

2. A deploy key for GitHub Actions, run as a normal sudo user:
     sudo -u ${APP_USER} ssh-keygen -t ed25519 -f /tmp/rs3_deploy -N ''
   Put the PUBLIC half in ${APP_ROOT}/.ssh/authorized_keys (owned by
   ${APP_USER}, chmod 600) and the PRIVATE half in the GitHub secret
   SSH_PRIVATE_KEY. Delete /tmp/rs3_deploy afterwards.

3. Confirm GitHub secrets exist: SSH_HOST, SSH_USER (=${APP_USER}),
   SSH_PRIVATE_KEY, plus every app variable listed in apps/api/.env.example.
   DATABASE_URL is NOT one of them — it is generated on this box and lives at
   ${APP_ROOT}/shared/database_url.

Request dashboard (GoAccess), regenerated every 5 minutes.

   Protected by HTTP basic auth:
     user:     admin
     password: $(cat "$STATS_PASS_FILE")

   Reach it either way:

     a) SSH tunnel, no DNS needed:
          ssh -L ${STATS_PORT}:127.0.0.1:${STATS_PORT} ${APP_USER}@<SERVER_IP>
          open http://localhost:${STATS_PORT}

     b) Through the tunnel: add a second public hostname in Cloudflare
          panel.rs3groupiron.men  ->  HTTP  ->  127.0.0.1:${STATS_PORT}
        (the nginx block matches any hostname, so the name is yours to pick)

   The password above is the only thing in front of it, so treat it as a real
   credential — the report lists client IPs and every path requested. To also
   restrict by IP, re-run this script as:

     sudo STATS_ALLOW_IP=<your.ip.here> bash bootstrap.sh

     sudo systemctl start rs3-stats     # regenerate now

Nothing is listening publicly: ufw allows only SSH inbound, Postgres is bound
to localhost, nginx to 127.0.0.1:${PROXY_PORT} and :${STATS_PORT}, and
cloudflared dials out.
EOF
