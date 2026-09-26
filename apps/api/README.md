# @rs3/api

NestJS + Prisma API behind [rs3groupiron.men](https://rs3groupiron.men). Serves
the React site and receives pushes from the in-game RS3 plugin.

## Running it

```bash
pnpm dev:db        # Postgres on 127.0.0.1:5432
pnpm db:migrate
pnpm dev:api       # :3000
```

Copy `.env.example` to `.env` first. Every key is documented there.

```bash
pnpm --filter @rs3/api test
pnpm --filter @rs3/api lint
```

## Shape

| Path | What |
|---|---|
| `src/groups/` | groups, members, inventories, skills, quests, achievements |
| `src/groups/group-events.service.ts` | SSE fan-out to connected browsers |
| `src/gamevals/` | RS3 cache dumps (item/quest/var names) |
| `src/uploads/` | presigned R2 URLs for achievement screenshots |
| `src/instrumentation.ts` | OpenTelemetry; inert unless an OTLP endpoint is set |
| `prisma/` | schema and migrations |

## Auth

A group's token is its only credential. It is created with the group and never
rotates, and travels verbatim in the `Authorization` header.

| Routes | Demo group | Any other group |
|---|---|---|
| `am-i-logged-in`, `get-group-data`, `xp-history` | no token needed | token required |
| everything else | rejected | token required |

The seeded demo group is public sample data and read-only.

## Reading group data

`GET /group/:name/get-group-data` returns every member in full.

With `?from_time=<ISO>` it returns a delta: unchanged members collapse to
`{ name }`. Adding `&split=1` also collapses members whose position or vitals
changed but whose inventories and skills did not, marking them `partial: true`
for the client to merge. That is what stops a single step re-sending a 4000-item
bank.

`GET /group/:name/events` is the same data over SSE — a snapshot on connect,
then `split`-style deltas pushed as the group changes. The website uses it; the
plugin does not need to.

## Deploying

See [`deploy/README.md`](../../deploy/README.md).
