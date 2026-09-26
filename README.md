# RS3 Group Ironman

Monorepo for [rs3groupiron.men](https://rs3groupiron.men): a NestJS + Prisma API (`apps/api`) and a React/Vite site (`apps/web`).

## Local development

```bash
docker compose up -d            # Postgres on 127.0.0.1:5432
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm db:migrate                 # apply migrations
pnpm dev                        # API on :3000, site on :5173
```

No Docker? `pnpm dev:db` runs a throwaway Postgres on the same port and
credentials via `tools/dev-db` (installed on first run, kept out of the
workspace so production builds never see it). Data lives in
`tools/dev-db/.pgdata`; Ctrl+C stops it.

The API auto-seeds a "Demo Group" when the database is empty (outside production). It is public sample data: the three read endpoints serve it with no `Authorization` header, and all writes to it are rejected. Every other group needs its token.

## Auth model

A group's token is its only credential; it is created with the group and never rotates. Send it verbatim in the `Authorization` header.

| Route kind | Demo group | Any other group |
|---|---|---|
| `am-i-logged-in`, `get-group-data`, `xp-history` | no token needed | token required |
| everything else (plugin pushes, settings, members) | rejected | token required |

## Production checklist

Set these in the API environment before starting `pnpm start:api`:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | your Postgres URL with a real password |
| `CORS_ORIGINS` | `https://rs3groupiron.men,https://www.rs3groupiron.men` |
| `TRUST_PROXY` | `1` when behind nginx, Caddy or Cloudflare; leave unset otherwise |
| `ALLOW_DEV_RESET` | leave unset (enables the database-wiping dev endpoint) |
| `SEED_DEMO` | leave unset unless you want the public demo group |
| `DEMO_WRITABLE` | leave unset (demo group stays read-only) |
| `CDN_BASE_URL` | `https://cdn.rs3groupiron.men` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | your Cloudflare R2 bucket (optional; uploads return 503 without them) |
| `UPLOAD_MAX_BYTES` | `5242880` (5 MiB) unless you want a different cap |

Seeded groups get a fresh random token at seed time, so the placeholder token in `apps/api/data/seed.json` is never a live credential.

Then:

```bash
pnpm build
pnpm --filter @rs3/api exec prisma migrate deploy
pnpm start:api
```

Serve `apps/web/dist` from your static host and proxy `/api` to the API. Recommended headers for the static host:

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://raw.githubusercontent.com https://chisel.weirdgloop.org https://cdn.discordapp.com; connect-src 'self' https://raw.githubusercontent.com https://sheets.googleapis.com; frame-src https://www.youtube-nocookie.com; form-action 'self'; upgrade-insecure-requests
Referrer-Policy: strict-origin-when-cross-origin
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

If the API lives on a different origin, add it to `connect-src`.

## Deploying (Railway + Vercel)

The API and Postgres run together on Railway; the web app runs on Vercel and
proxies `/api` to Railway so the browser only ever talks to one origin. Both
deploy only from the `production` branch: merge into it when you want a
release, and nothing else you push goes live.

### Railway (API + Postgres)

1. New project → **Deploy from GitHub repo**, pick this repo. Leave the root
   directory at the repo root: `railway.json` there holds the build, migrate
   and start commands, and only changes under `apps/api/` trigger a deploy.
   In the service's **Settings → Source** set the branch to `production`, and
   leave **PR environments** off so pull requests never spin up a copy.
2. **New → Database → PostgreSQL** in the same project. Railway injects its
   connection string; on the API service add a variable
   `DATABASE_URL=${{Postgres.DATABASE_URL}}` so it comes over the private
   network.
3. Add the rest of the variables from the production checklist above.
   `PORT` is injected by Railway. Set `TRUST_PROXY=1` and `CORS_ORIGINS` to
   your Vercel domain(s).
4. Settings → Networking → **Custom Domain** → `api.rs3groupiron.men`. Railway
   shows a CNAME target; add that record in Cloudflare (proxied) and the
   domain verifies within a minute. The web rewrite already points at it.

Each deploy runs `prisma migrate deploy` before the new build takes traffic,
and Railway waits for `/health` to pass before switching over.

### Vercel (web)

1. New project from the same repo. Set **Root Directory** to `apps/web`;
   Vercel detects Vite and pnpm from the workspace lockfile. Under
   **Settings → Git** set the Production Branch to `production`. The
   `ignoreCommand` in `vercel.json` then skips builds for every other branch,
   so no preview deployments are created.
2. `apps/web/vercel.json` proxies `/api` to `api.rs3groupiron.men` and sets
   the SPA fallback, asset caching and the security headers listed above, so
   nothing needs configuring in the dashboard.
3. Point your domain at Vercel and add it to `CORS_ORIGINS` on Railway.

Cloudflare in front of both is optional but recommended once traffic grows:
group reads are cheap to cache for a few seconds at the edge.

## Achievement screenshots (Cloudflare R2)

Screenshots are uploaded straight from the client to R2 — the bytes never pass
through the API, so there is no bandwidth cost and no request-size limit to fight.

1. Create an R2 bucket and attach the custom domain `cdn.rs3groupiron.men`.
2. Create an R2 API token (Object Read & Write) and set the four `R2_*` vars.
3. Set `CDN_BASE_URL` to the bucket's public domain.

The flow:

```
POST /api/group/<name>/achievements/upload-url
  Authorization: <group token>
  { "kind": "quest", "content_length": 204800 }
->
  { "upload_url": "https://<bucket>.<account>.r2.cloudflarestorage.com/...",
    "public_url": "https://cdn.rs3groupiron.men/achievements/<groupId>/quests/<uuid>.png",
    "method": "PUT",
    "headers": { "Content-Type": "image/png", "Content-Length": "204800" },
    "expires_in": 300, "max_bytes": 5242880 }
```

PUT the file to `upload_url` with exactly those headers, then post the
achievement with `image_url` set to `public_url`.

Guarantees worth knowing:

- **PNG only, exact size.** Content type and content length are part of the
  signature, so a client cannot upload a different type or a larger file than
  it declared, and the API rejects a declared size over `UPLOAD_MAX_BYTES`.
- **Server-chosen keys.** The object key is generated by the API, so one group
  can never overwrite another's screenshots.
- **URLs are validated on the way back in.** An achievement's `image_url` is
  only stored when its origin matches `CDN_BASE_URL`.
- **Links expire in 5 minutes** and are single-purpose.

The path segment is the group's internal id, never its token — a screenshot URL
posted in Discord leaks nothing.

## Icons and share image

Regenerate favicons, PWA icons and the Open Graph image from `apps/web/design/gim-logo-source.png`:

```bash
node apps/web/design/build-icons.mjs   # needs `sharp` on NODE_PATH
```
