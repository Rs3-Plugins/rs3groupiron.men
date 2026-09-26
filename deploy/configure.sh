#!/usr/bin/env bash
#
# Re-appliable server configuration: nginx, the panel, systemd units, timers.
#
#   sudo bash deploy/configure.sh
#
# Split out of bootstrap.sh so a deploy can re-apply it safely. Everything here
# is idempotent and cheap to repeat. Deliberately absent: apt installs, the
# firewall, user creation and the PostgreSQL cluster — those are one-time
# infrastructure and have no business running on every release.
set -euo pipefail

APP_USER=rs3
APP_ROOT=/srv/rs3
BLUE_PORT=3001
GREEN_PORT=3002
PROXY_PORT=8080
STATS_PORT=8081
# How often the GoAccess report is rebuilt. The live strip on it refreshes
# every 5s on its own; this only governs the request panels, which are a
# full re-parse of the access log.
STATS_INTERVAL="${STATS_INTERVAL:-3min}"
# GoAccess built-in theme: darkBlue | darkPurple | darkGray | bright.
# The gear icon in the report switches it per-browser; this sets the default.
STATS_THEME="${STATS_THEME:-darkBlue}"

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "run as root: sudo bash $0" >&2
  exit 1
fi

# ---------------------------------------------------------------- nginx limits
# worker_connections lives in the events{} block, which conf.d cannot reach
# because that is included inside http{} — so nginx.conf is edited in place.
#
# Debian ships 768. Each proxied request uses two of those (client plus
# upstream), so the default caps concurrency near 384, and an SSE viewer holds
# its pair for the lifetime of the browser tab. That is the lowest ceiling in
# the whole stack and it is reached silently: nginx just stops accepting.
log "nginx connection limits"
sed -i 's/^\s*worker_connections\s\+[0-9]\+;/        worker_connections 4096;/' \
  /etc/nginx/nginx.conf
grep -q '^worker_rlimit_nofile' /etc/nginx/nginx.conf \
  || sed -i '1i worker_rlimit_nofile 32768;' /etc/nginx/nginx.conf
grep -E '^worker_rlimit_nofile|worker_connections' /etc/nginx/nginx.conf

# ---------------------------------------------------------------- nginx switch
log "nginx blue/green switch on 127.0.0.1:${PROXY_PORT}"
# cloudflared points at this one address forever; deploys only rewrite which
# upstream it forwards to. nginx reload is graceful, so in-flight requests
# finish on the old process while new ones go to the new release.
# Only seeded if absent. This file is runtime state owned by release.sh — on a
# re-run it already points at whichever colour is live, and overwriting it sent
# nginx to a stopped instance and took the API down with a 502.
if [[ ! -f /etc/nginx/conf.d/rs3-upstream.conf ]]; then
  cat >/etc/nginx/conf.d/rs3-upstream.conf <<EOF
upstream rs3_api {
  server 127.0.0.1:${BLUE_PORT};
  # Without this nginx opens a fresh TCP connection to Node for every request
  # and closes it again, which under load costs a handshake per request and
  # leaves sockets in TIME_WAIT. Pooled connections are reused instead.
  keepalive 64;
  # Must stay below the app's server.keepAliveTimeout (65s, set in main.ts) so
  # nginx always retires a pooled connection first. If the app closes first,
  # nginx sends the next request into a dead socket and answers 502.
  keepalive_timeout 60s;
}
EOF
  log "Seeded nginx upstream -> blue (${BLUE_PORT})"
else
  log "Kept existing nginx upstream: $(grep -o '127\.0\.0\.1:[0-9]*' /etc/nginx/conf.d/rs3-upstream.conf)"
fi
# Owned by the service user so a deploy can repoint the upstream without sudo.
# Not an escalation: that user already runs the process nginx forwards to.
chown "$APP_USER:$APP_USER" /etc/nginx/conf.d/rs3-upstream.conf
chmod 644 /etc/nginx/conf.d/rs3-upstream.conf

# log_format must live in the http context, so it goes in conf.d rather than
# the server block. Combined plus $request_time, which is what gives GoAccess
# per-endpoint timings instead of just counts.
#
# real_ip matters more than it looks: every request arrives from cloudflared on
# loopback, so without this $remote_addr is 127.0.0.1 for the entire internet —
# the access log would be useless and any IP rule would match everyone. Only
# 127.0.0.1 is trusted to set the header, so a client cannot forge it.
cat >/etc/nginx/conf.d/rs3-logformat.conf <<'EOF'
set_real_ip_from 127.0.0.1;
set_real_ip_from ::1;
real_ip_header CF-Connecting-IP;
real_ip_recursive on;

log_format rs3 '$remote_addr - $remote_user [$time_local] "$request" '
               '$status $body_bytes_sent "$http_referer" "$http_user_agent" '
               '$request_time';
EOF

cat >/etc/nginx/sites-available/rs3-api <<EOF
server {
    listen 127.0.0.1:${PROXY_PORT};
    server_name _;

    # Its own log so the report covers API traffic and nothing else.
    access_log /var/log/nginx/rs3-access.log rs3;

    # Plugin pushes can carry a 4000-item bank.
    client_max_body_size 2m;

    location / {
        proxy_pass http://rs3_api;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        # Required for the upstream keepalive pool to be used at all: the
        # default would forward a Connection header and close each one.
        proxy_set_header Connection        '';
        proxy_read_timeout 30s;
    }

    # Server-sent events. Without these the stream is buffered and the client
    # sees nothing until the connection closes, which looks exactly like SSE
    # "not working". The long read timeout keeps an idle stream alive between
    # heartbeats rather than dropping it at 30s.
    location ~ ^/api/group/[^/]+/events\$ {
        proxy_pass http://rs3_api;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection        '';

        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
}
EOF
ln -sf /etc/nginx/sites-available/rs3-api /etc/nginx/sites-enabled/rs3-api
rm -f /etc/nginx/sites-enabled/default

# ---------------------------------------------------------------- goaccess
log "GoAccess request dashboard on 127.0.0.1:${STATS_PORT}"
mkdir -p "$APP_ROOT/goaccess"
chown "$APP_USER:$APP_USER" "$APP_ROOT/goaccess"
chmod 755 "$APP_ROOT/goaccess"

# The dashboard. Kept as a real file in deploy/panel/ rather than a heredoc so
# it can be edited, diffed and linted like anything else; copied into place
# here. GoAccess's own report stays available at /report.html.
PANEL_SRC="$(dirname "$(readlink -f "$0")")/panel/index.html"
if [[ -f "$PANEL_SRC" ]]; then
  install -o "$APP_USER" -g "$APP_USER" -m 644 "$PANEL_SRC" \
    "$APP_ROOT/goaccess/index.html"
  log "Installed dashboard -> $APP_ROOT/goaccess/index.html"
else
  warn_panel="panel/index.html missing beside configure.sh; dashboard not installed"
  printf '\033[1;33m!!  %s\033[0m\n' "$warn_panel"
fi
rm -f "$APP_ROOT/goaccess/live-widget.html"

# nginx logs are root:adm 640, so the report job reads them via the adm group
# rather than running as root.
usermod -aG adm "$APP_USER"

# Custom CSS layered over whichever GoAccess theme is active. Deliberately
# restrained — it softens the chrome and matches the live strip rather than
# fighting the theme's own colours, so switching themes still works.
cat >"$APP_ROOT/goaccess/custom.css" <<'CSS'
:root { --rs3-radius: 8px }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
       Roboto, sans-serif !important; }
.panel-body, .wrap-general-items > div, .panel, .table-wrapper {
  border-radius: var(--rs3-radius) !important;
}
/* Tabular figures stop the big counters jittering as they update. */
.panel h3, .wrap-general-items .label, td, th {
  font-variant-numeric: tabular-nums;
}
.wrap-general-items > div { transition: transform .12s ease; }
.wrap-general-items > div:hover { transform: translateY(-1px); }
table tbody tr:hover { filter: brightness(1.12); }
/* Tighter headings; GoAccess defaults are shouty at this density. */
h2, .panel-title { letter-spacing: .01em; }
CSS
chown "$APP_USER:$APP_USER" "$APP_ROOT/goaccess/custom.css"
chmod 644 "$APP_ROOT/goaccess/custom.css"

# Theme in a file rather than baked into the script: changeable without
# re-running this, and it keeps the heredoc below fully literal.
echo "$STATS_THEME" >"$APP_ROOT/goaccess/theme"
chown "$APP_USER:$APP_USER" "$APP_ROOT/goaccess/theme"

cat >/usr/local/bin/rs3-stats <<'EOF'
#!/usr/bin/env bash
# Regenerates the request report: HTML for GoAccess's own detail view, JSON for
# the dashboard. Quoted heredoc — nothing below is expanded at install time.
set -euo pipefail

DIR=/srv/rs3/goaccess
OUT="$DIR/report.html"
JSON="$DIR/report.json"
# Extensions matter: GoAccess infers the output format from them, so the temp
# files cannot simply end in .tmp.
TMP_HTML="$DIR/.report.new.html"
TMP_JSON="$DIR/.report.new.json"
THEME=$(cat "$DIR/theme" 2>/dev/null || echo darkBlue)
CSS="$DIR/custom.css"

shopt -s nullglob
# Prefer the dedicated API log, which carries $request_time; fall back to
# nginx's default so this still works before the new log format is in place.
LOGS=("/var/log/nginx/rs3-access.log"*)
FMT='%h %^[%d:%t %^] "%r" %s %b "%R" "%u" %T'
if [[ ${#LOGS[@]} -eq 0 ]]; then
  LOGS=("/var/log/nginx/access.log"*)
  FMT='COMBINED'
fi

empty_json() {
  # A valid empty report, so the dashboard renders "no data yet" rather than a
  # fetch error.
  echo '{"general":{"total_requests":0,"failed_requests":0}}' >"$JSON"
}

placeholder() {
  printf '<!doctype html><meta charset="utf-8"><title>RS3 stats</title>
<body style="font-family:system-ui;padding:2rem;max-width:40rem">
<h1>No requests logged yet</h1><p>%s</p>
<p>nginx creates the log on its first request, and the report regenerates
every few minutes.</p><p><small>Checked %s</small></p>' "$1" "$(date -u)" \
    >"$TMP_HTML"
  mv "$TMP_HTML" "$OUT"
  empty_json
  exit 0
}

# nginx does not create the log until it serves something, and an empty log
# makes GoAccess exit non-zero. Neither is a failure — a quiet server should
# produce an empty report, not a red systemd unit.
[[ ${#LOGS[@]} -gt 0 ]] || placeholder "No access log yet."
[[ -n "$(zcat -f "${LOGS[@]}" 2>/dev/null | head -c 1)" ]] \
  || placeholder "The access log exists but is empty."

run() {
  zcat -f "${LOGS[@]}" 2>/dev/null \
    | goaccess - \
        --log-format="$FMT" \
        --date-format='%d/%b/%Y' \
        --time-format='%H:%M:%S' \
        "$@"
}

# GoAccess cannot emit two formats in one pass, so the log is parsed twice. At
# this size that is well under a second.
run --agent-list \
    --html-prefs "{\"theme\":\"$THEME\"}" \
    ${CSS:+--html-custom-css "$CSS"} \
    -o "$TMP_HTML"
run -o "$TMP_JSON"

# Swap both at the end so a reader never sees a half-written pair.
mv "$TMP_JSON" "$JSON"
mv "$TMP_HTML" "$OUT"
EOF
chmod 755 /usr/local/bin/rs3-stats

cat >/etc/systemd/system/rs3-stats.service <<EOF
[Unit]
Description=Regenerate the GoAccess request report
[Service]
Type=oneshot
User=${APP_USER}
ExecStart=/usr/local/bin/rs3-stats
EOF

cat >/etc/systemd/system/rs3-stats.timer <<EOF
[Unit]
Description=Regenerate the GoAccess request report every ${STATS_INTERVAL}
[Timer]
OnBootSec=1min
OnUnitActiveSec=${STATS_INTERVAL}
Persistent=true
[Install]
WantedBy=timers.target
EOF

# Password for the stats panel. Generated once and kept on the box, same as the
# database password — it is never printed to a log or sent to GitHub.
STATS_PASS_FILE="$APP_ROOT/shared/stats_password"
if [[ ! -f "$STATS_PASS_FILE" ]]; then
  openssl rand -base64 24 | tr -d '\n/+=' | head -c 24 >"$STATS_PASS_FILE"
  chmod 600 "$STATS_PASS_FILE"
  chown "$APP_USER:$APP_USER" "$STATS_PASS_FILE"
fi
htpasswd -bc /etc/nginx/.rs3-stats-htpasswd admin "$(cat "$STATS_PASS_FILE")" >/dev/null 2>&1
chown root:www-data /etc/nginx/.rs3-stats-htpasswd
chmod 640 /etc/nginx/.rs3-stats-htpasswd

# Safe to expose through the tunnel because of the basic auth below. The report
# still lists client IPs and every path requested, so treat the password as a
# real credential rather than a formality.
#
# STATS_ALLOW_IP optionally narrows it further: set it before running this
# script to also require the request come from that address. Thanks to real_ip
# above, $remote_addr is the true client IP rather than the tunnel's loopback.
STATS_ALLOW_IP="${STATS_ALLOW_IP:-}"
if [[ -n "$STATS_ALLOW_IP" ]]; then
  STATS_IP_RULES="        allow ${STATS_ALLOW_IP};
        deny all;"
  log "Stats panel restricted to ${STATS_ALLOW_IP} plus password"
else
  STATS_IP_RULES="        # No IP restriction. Re-run with STATS_ALLOW_IP=<your ip> to add one."
  log "Stats panel protected by password only"
fi

cat >/etc/nginx/sites-available/rs3-stats <<EOF
server {
    listen 127.0.0.1:${STATS_PORT};
    server_name _;
    root ${APP_ROOT}/goaccess;
    index index.html;

    access_log /var/log/nginx/rs3-stats-access.log rs3;

    # Live counts proxied from the API so the panel can read them same-origin.
    # Served here rather than fetched from api.<domain> to avoid CORS and to
    # keep it behind the same password as everything else on this port.
    location = /live {
${STATS_IP_RULES}

        auth_basic "RS3 stats";
        auth_basic_user_file /etc/nginx/.rs3-stats-htpasswd;

        proxy_pass http://rs3_api/api/stats/live;
        proxy_set_header Host \$host;
        proxy_cache off;
        add_header Cache-Control "no-store" always;
    }

    location / {
${STATS_IP_RULES}

        auth_basic "RS3 stats";
        auth_basic_user_file /etc/nginx/.rs3-stats-htpasswd;

        try_files \$uri \$uri/ =404;
    }
}
EOF
ln -sf /etc/nginx/sites-available/rs3-stats /etc/nginx/sites-enabled/rs3-stats

nginx -t
systemctl enable --now nginx
systemctl reload nginx
systemctl daemon-reload
systemctl enable --now rs3-stats.timer

# ---------------------------------------------------------------- systemd
log "systemd template unit rs3-api@.service"
cat >/etc/systemd/system/rs3-api@.service <<EOF
[Unit]
Description=RS3 Group Ironman API (%i)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_ROOT}/current-%i/apps/api
EnvironmentFile=${APP_ROOT}/shared/.env
EnvironmentFile=${APP_ROOT}/shared/port-%i.env
# Set after the files so these always win: both are facts about this
# deployment, not things a secret should be able to get wrong. Without
# NODE_ENV=production the API falls back to its localhost CORS origins.
Environment=NODE_ENV=production
# client -> Cloudflare -> cloudflared -> nginx -> app. cloudflared puts the real
# client IP in X-Forwarded-For and nginx appends its own, so exactly one hop is
# trusted. Rate limiting sees real IPs instead of 127.0.0.1.
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node dist/main.js
Restart=always
RestartSec=2

# Every SSE viewer holds a socket open for as long as its tab is. The default
# 1024 would cap concurrent streams well below what the box can actually carry,
# and the failure mode is EMFILE on accept — which looks like the API hanging.
LimitNOFILE=65535

# Give in-flight requests a chance to finish; the API flushes traces on SIGTERM.
KillSignal=SIGTERM
TimeoutStopSec=25

# Hardening: the service needs its own directory and the loopback, nothing else.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_ROOT}
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

echo "PORT=${BLUE_PORT}" >"$APP_ROOT/shared/port-blue.env"
echo "PORT=${GREEN_PORT}" >"$APP_ROOT/shared/port-green.env"
chown "$APP_USER:$APP_USER" "$APP_ROOT"/shared/port-*.env
systemctl daemon-reload

# Rebuild the report now rather than leaving the panel showing stale data until
# the timer next fires. Non-fatal: a failure here should not fail a deploy.
log "Refreshing the request report"
systemctl start rs3-stats || printf '\033[1;33m!!  report refresh failed; see: journalctl -u rs3-stats\033[0m\n'
