# Self-hosted deploy (API + Postgres)

The web app stays on Vercel. This covers the API and its database on your own
Ubuntu box, reached through a Cloudflare Tunnel so **no inbound port is ever
opened**.

```
browser ─▶ Vercel (static + /api proxy)
                     │
                     ▼
            Cloudflare edge
                     │  tunnel, outbound-only
                     ▼
   your server: cloudflared ─▶ nginx 127.0.0.1:8080 ─▶ API (blue :3001 / green :3002)
                                                           │
                                                           ▼
                                              Postgres on localhost
```

## Files

| File | Runs | Purpose |
|---|---|---|
| `bootstrap.sh` | once, on the server as root | user, firewall, Postgres, Node, nginx, cloudflared, backups |
| `render-env.mjs` | in CI | builds `.env` from `.env.example` + GitHub secrets |
| `release.sh` | on the server, per deploy | blue/green switch with health gate |
| `../.github/workflows/deploy-api.yml` | GitHub Actions | build, test, ship, activate |

## One-time setup

### 1. Bootstrap the server

```bash
git clone <your repo> /tmp/rs3 && cd /tmp/rs3
sudo bash deploy/bootstrap.sh
```

Idempotent — safe to re-run after changing tuning values.

It generates the database password itself and writes the connection string to
`/srv/rs3/shared/database_url`. **That value never goes to GitHub.**

### 2. Cloudflare Tunnel

Create a tunnel in the Cloudflare dashboard (Zero Trust → Networks → Tunnels),
then on the server:

```bash
sudo cloudflared service install <YOUR_TUNNEL_TOKEN>
```

Add a public hostname to the tunnel:

| Field | Value |
|---|---|
| Subdomain | `api` |
| Domain | `rs3groupiron.men` |
| Service | `http://127.0.0.1:8080` |

Then set Vercel's `VITE_API_ORIGIN` and `/api` rewrite to
`https://api.rs3groupiron.men`.

### 3. Deploy key

```bash
ssh-keygen -t ed25519 -f ./rs3_deploy -N '' -C 'github-actions'
sudo tee -a /srv/rs3/.ssh/authorized_keys < ./rs3_deploy.pub
sudo chown rs3:rs3 /srv/rs3/.ssh/authorized_keys
sudo chmod 600 /srv/rs3/.ssh/authorized_keys
ssh-keyscan -H <SERVER_IP>        # for SSH_KNOWN_HOSTS
```

Put the private half in the `SSH_PRIVATE_KEY` secret, then delete your local
copy.

### 4. GitHub configuration

**Secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `SSH_HOST` | server IP or hostname |
| `SSH_USER` | `rs3` |
| `SSH_PRIVATE_KEY` | private half of the deploy key |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan -H <SERVER_IP>` |
| `SSH_PORT` | only if not 22 |

Plus any variable from `apps/api/.env.example` you want set — at minimum
`CORS_ORIGINS`, `CDN_BASE_URL`, the four `R2_*` values, and the `OTEL_*` ones.

**Variables** (not secrets):

| Variable | Value |
|---|---|
| `API_PUBLIC_URL` | `https://api.rs3groupiron.men` — enables the post-deploy public health check |

## How the env file works

`apps/api/.env.example` is the list of keys. On every deploy the workflow walks
it and, for each key, uses a GitHub secret of the same name if one exists and
the example's default otherwise.

That means **adding a variable to `.env.example` is enough** — the next deploy
picks it up, no server changes. Two keys are excluded deliberately:

- `DATABASE_URL` — generated on the server, appended by `release.sh`
- `PORT` — set per colour by systemd

`NODE_ENV=production` and `TRUST_PROXY=1` are pinned in the systemd unit so a
missing or wrong secret cannot put production into development mode.

A secret with no matching key in `.env.example` is still written, and the CI log
names it — otherwise it would silently do nothing.

## How a deploy works

Push to `production`, then:

1. CI installs, generates the Prisma client, **runs the tests**, builds
2. Bundles production-only dependencies and verifies the bundle loads
3. Renders `.env` and uploads both to the server
4. `release.sh` picks the idle colour, runs `prisma migrate deploy`
5. Starts the new colour on its own port and polls `/health` until
   `db.ok == true` (up to 90s)
6. **Only then** repoints nginx and reloads — graceful, so in-flight requests
   finish on the old process
7. Waits 5s, stops the old colour, prunes to the last 5 releases

If the health check fails, the new colour is stopped, the old one keeps
serving, and CI fails with the new process's logs.

### Migrations and zero downtime

Migrations run **before** the switch, so for a moment the old code runs against
the new schema. Additive changes (new nullable columns — what this project has
been doing) are fine. A destructive change is not: split it into expand (deploy,
add the new thing) and contract (a later deploy removes the old), or you will
take an outage.

## Rollback

Releases are kept, so roll back by re-running against an older one:

```bash
ssh rs3@<host>
ls -lt /srv/rs3/releases
bash /srv/rs3/releases/<older-sha>/deploy/release.sh <older-sha>
```

This does **not** roll back migrations. If the bad release included one, restore
from the nightly dump.

## Security posture

- **No inbound ports except SSH.** The tunnel dials out; nginx and Postgres both
  bind to loopback.
- Postgres: `scram-sha-256`, `listen_addresses=localhost`, app role is not
  superuser, `PUBLIC` cannot create in `public`.
- The service user has no password and a locked account; sudo is restricted to
  an explicit list of systemctl/nginx commands.
- systemd hardening: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`,
  writable only under `/srv/rs3`.
- `fail2ban` on SSH, unattended security upgrades.
- `.env` is `0600`, owned by the service user.

Consider also disabling SSH password auth entirely (`PasswordAuthentication no`
in `/etc/ssh/sshd_config`) — the bootstrap does not change your SSH config,
since locking yourself out of a box you just built is an unpleasant surprise.

## Backups

Nightly `pg_dump -Fc` at 03:30 UTC: kept 14 days in `/srv/rs3/backups` and
copied to Cloudflare R2, where 30 days are kept.

```bash
sudo systemctl start rs3-backup        # run one now
journalctl -u rs3-backup -n 20         # confirm the upload
```

### What is backed up, and why only this

The database, and nothing else. Everything else on the box is reproducible:
code and server config are in git, `.env` is regenerated from GitHub secrets on
each deploy, and the database and panel passwords are regenerated by
`bootstrap.sh` on a fresh host.

What exists nowhere else is **group tokens** (a group's only credential, which
never rotates), inventories, and `skill_xp_samples` — a time series that cannot
be reconstructed after the fact.

### The bucket must be private

`R2_BACKUP_BUCKET` has to be a **different bucket from `R2_BUCKET`**. That one
is public behind `CDN_BASE_URL` for achievement screenshots, and a dump contains
every group's token — putting one there would publish them. The script refuses
to run if the two match.

Create it in Cloudflare R2 with no public access and no custom domain, then add
`R2_BACKUP_BUCKET` to your GitHub secrets.

### Restoring

Work this out now, not during an outage.

```bash
# From a local dump
sudo -u postgres pg_restore --clean --if-exists -d rs3_gim \
  /srv/rs3/backups/rs3_gim-<STAMP>.dump

# From R2, onto a fresh machine
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID=... RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=...
export RCLONE_CONFIG_R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
rclone lsf R2:<backup-bucket>/db/              # pick one
rclone copy R2:<backup-bucket>/db/<file> /tmp/
sudo -u postgres pg_restore --clean --if-exists -d rs3_gim /tmp/<file>
```

Restoring onto a fresh host means `bootstrap.sh` has already created an empty
`rs3_gim`; `--clean --if-exists` makes the restore idempotent, so a failed
attempt can simply be repeated.

**Test a restore before you need one.** Pull last night's dump into a scratch
database and check the row counts:

```bash
sudo -u postgres createdb restore_test
sudo -u postgres pg_restore -d restore_test /srv/rs3/backups/<file>
sudo -u postgres psql -d restore_test -c \
  'SELECT (SELECT count(*) FROM groups) AS groups, (SELECT count(*) FROM members) AS members;'
sudo -u postgres dropdb restore_test
```

## Request dashboard

GoAccess regenerates an HTML report from the API access log every 5 minutes:
request counts, status-code breakdown, top endpoints, bandwidth, response
times, and user agents. It costs essentially nothing — a single binary, no
database, no agent.

Protected by HTTP basic auth as `admin`, with a password generated by
`bootstrap.sh` and stored at `/srv/rs3/shared/stats_password` (mode 600, never
sent to GitHub). Reach it either way:

```bash
# a) SSH tunnel — no DNS needed
ssh -L 8081:127.0.0.1:8081 rs3@<host>
# open http://localhost:8081

# b) Through the Cloudflare Tunnel — add a public hostname:
#      panel.rs3groupiron.men  ->  HTTP  ->  127.0.0.1:8081
```

The nginx block uses `server_name _`, so the hostname is yours to choose —
`panel`, `stats`, anything. No server change is needed to rename it.

**That password is the only thing in front of it.** The report lists client IPs
and every path requested, including group names in URLs. To also restrict by
source address:

```bash
sudo STATS_ALLOW_IP=<your.ip> bash deploy/bootstrap.sh
```

That works only because nginx is configured with `real_ip_header
CF-Connecting-IP` — every request arrives from cloudflared on loopback, so
without it `$remote_addr` would be `127.0.0.1` for the entire internet and an
allowlist would match everyone. Only loopback is trusted to set that header, so
a client cannot forge it.

For something stronger than a shared password, put **Cloudflare Access** in
front of the hostname and get SSO with nothing to rotate.

```bash
sudo systemctl start rs3-stats      # regenerate immediately
systemctl list-timers rs3-stats     # check the schedule
```

The report spans whatever `logrotate` is keeping, because the job reads rotated
`.gz` logs too — not just the current day.

### How this fits with the rest

| Question | Where to look |
|---|---|
| Total requests, status codes, bandwidth, geography | **Cloudflare dashboard** — free, already collecting |
| Which endpoints are hot, which are failing, response times | **GoAccess**, above |
| Why a specific request was slow (span breakdown) | **Grafana Cloud** traces |
| Slow queries, call counts, row volumes | `pg_stat_statements` (see below) |
| Latency as a user experiences it | `tools/perf/perf.mjs` |

Note that cache hit rate is not a meaningful number for this API — group data is
authenticated, per-group and constantly changing, so it is uncacheable by
design. The equivalent savings here are the content-hash skip on unchanged
banks and the partial deltas, which show up as *absent* queries in
`pg_stat_statements` rather than as a cache ratio.

## Checking on it

```bash
systemctl status 'rs3-api@*'
journalctl -u rs3-api@blue -f
cat /srv/rs3/shared/active_color
curl -s localhost:8080/health | jq
sudo -u postgres psql -d rs3_gim -c \
  'SELECT calls, mean_exec_time, max_exec_time, query FROM pg_stat_statements ORDER BY max_exec_time DESC LIMIT 10;'
```

That last one needs `pg_stat_statements`, which the bootstrap enables. It is
the fastest way to find a slow query.
