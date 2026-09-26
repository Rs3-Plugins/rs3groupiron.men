# RS3 Group Ironman

Monorepo for [rs3groupiron.men](https://rs3groupiron.men): a NestJS + Prisma API
(`apps/api`) and a React/Vite site (`apps/web`).

The site is a live map and shared bank for RuneScape 3 group ironman teams. The
in-game plugin pushes positions, inventories and skills; the site shows them.

| | Runs on |
|---|---|
| API + Postgres | a self-hosted Ubuntu box behind a Cloudflare Tunnel |
| Website | Vercel, proxying `/api` to the API |
| Screenshots | Cloudflare R2, uploaded directly from the client |

## Local development

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
pnpm dev:db                     # Postgres on 127.0.0.1:5432
pnpm db:migrate
pnpm dev                        # API on :3000, site on :5173
```

`dev:db` is a throwaway Postgres needing no Docker. Data lives in
`tools/dev-db/.pgdata`; Ctrl+C stops it. Any Postgres on the same port and
credentials works instead — see `apps/api/.env.example`.

The API auto-seeds a "Demo Group" when the database is empty (outside
production). It is public sample data: the read endpoints serve it with no
`Authorization` header, and all writes to it are rejected.

## Auth model

A group's token is its only credential; it is created with the group and never
rotates. Send it verbatim in the `Authorization` header.

| Route kind | Demo group | Any other group |
|---|---|---|
| `am-i-logged-in`, `get-group-data`, `xp-history`, `events` | no token needed | token required |
| everything else (plugin pushes, settings, members) | rejected | token required |

## How group data reaches the browser

The site opens an SSE stream (`/events`) and stops polling. Changes are pushed,
coalesced to at most one broadcast per group every 750ms, and one database read
serves every viewer of that group.

Polling `get-group-data` remains as a fallback for when the stream cannot be
established. See [`apps/web/README.md`](apps/web/README.md) for why that matters
and [`apps/api/README.md`](apps/api/README.md) for the delta formats.

The plugin is unaffected by any of this — it only ever POSTs JSON.

## Deploying

The API deploys to your own server on push to `production`; the site deploys to
Vercel from the same branch.

Setup, the deploy pipeline, Postgres tuning, backups and the admin panel are all
in **[`deploy/README.md`](deploy/README.md)**.

## Measuring it

```bash
node tools/perf/ceiling.mjs  --url https://api.rs3groupiron.men --concurrency 200
node tools/perf/perf.mjs     --url https://api.rs3groupiron.men --group "Demo Group"
node tools/perf/loadtest.mjs --url https://api.rs3groupiron.men --steps 1,5,10,20,40
node tools/perf/sse-load.mjs --url https://api.rs3groupiron.men --viewers 500 --writer
```

Run `ceiling.mjs` first. It floods a trivial endpoint to find what the network
path alone can carry, so a limit that shows up at the same rate in a later test
is the client or the tunnel rather than the API.

`perf.mjs` and `ceiling.mjs` are read-only and safe against production.
`loadtest.mjs` **writes** — it creates a group named `LT-<id>` and fills it with
realistic data, which stays until you remove it:

```sql
DELETE FROM groups WHERE name LIKE 'LT-%';
```

`sse-load.mjs` holds many event streams open at once, which is the number that
decides how many viewers one instance carries; polling and streaming have very
different ceilings. Use `node:http`-based tools for this — `fetch()` silently
caps concurrent never-ending responses.

Every response carries `X-Response-Time-Ms`, so the tools report server time
separately from network time. That distinction matters: on a remote connection
the network is usually the larger number.

## Achievement screenshots (Cloudflare R2)

Screenshots are uploaded straight from the client to R2 — the bytes never pass
through the API, so there is no bandwidth cost and no request-size limit to
fight.

1. Create an R2 bucket and attach the custom domain `cdn.rs3groupiron.men`.
2. Create an R2 API token (Object Read & Write) and set the four `R2_*` vars.
3. Set `CDN_BASE_URL` to the bucket's public domain.

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

- **PNG only, exact size.** Content type and length are part of the signature,
  so a client cannot upload a different type or a larger file than it declared.
- **Server-chosen keys**, so one group can never overwrite another's.
- **URLs are validated on the way back in** — an `image_url` is only stored when
  its origin matches `CDN_BASE_URL`.
- **Links expire in 5 minutes.**

The path segment is the group's internal id, never its token: a screenshot URL
posted in Discord leaks nothing.

## Icons and share image

Regenerate favicons, PWA icons and the Open Graph image from
`apps/web/design/gim-logo-source.png`:

```bash
node apps/web/design/build-icons.mjs   # needs `sharp` on NODE_PATH
```
