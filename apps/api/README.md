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

Plugin pushes (`update-group-member`, `player-moved`, `set-member-online`,
`update-member-quests`) carry the character's display name and only update
names already on the roster; anything else is a 404. The token is shared by the
whole group, so this is what stops a member logged into another account from
adding it. Members are added through `add-group-member`.

`update-group-member` accepts full inventory snapshots (`inventory`,
`equipment`, `bank`, `shared_bank`, `inventories`) and, for everything except
the positional backpack, `inventory_changes`: per-item `[itemId, newTotal, ...]`
deltas the plugin sends while a bank is open. A snapshot and deltas for the
same inventory in one request resolve to the snapshot. The response lists the
fields it `applied` and whether the heavy data actually changed.

`update-member-achievements` stores completed RS3 achievements and diaries by
gameval, and `GET achievement-progress` reads them back. A member's first sync
establishes a baseline without posting to the feed; later completions are
posted. Achievements that mirror a quest (`quest_*`) are stored but kept out of
the feed, since the quest sync already posts those.

`update-member-quests` skips quests the server's gameval dump does not know
and reports them as `skipped`, so a quest newer than the dump never blocks the
rest of the sync.

A member is reported `online` only while the plugin has been heard from in
the last 12 minutes (it heartbeats every 5 while idle), so a crashed client
does not stay online forever.

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
