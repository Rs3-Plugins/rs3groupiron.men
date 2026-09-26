# @rs3/web

React + Vite front end for [rs3groupiron.men](https://rs3groupiron.men):
group map, bank, skills, quests and achievements. Deployed to Vercel, which
proxies `/api` to the API.

## Running it

```bash
pnpm dev:api       # the API must be up
pnpm dev:web       # :5173, proxies /api to :3000
```

```bash
pnpm --filter @rs3/web build
pnpm --filter @rs3/web lint
```

## Shape

| Path | What |
|---|---|
| `src/hooks/useGroupData.ts` | live group state: SSE with a polling fallback |
| `src/lib/groupStream.ts` | SSE client (fetch streaming, not EventSource) |
| `src/lib/mergeDelta.ts` | merges stub / partial / full members into the cache |
| `src/components/GroupMapShell/` | the main shell and its tabs |
| `design/` | icon and demo-shot generators |

## How group data arrives

The page opens an SSE stream and stops polling. Each event is either a full
snapshot or a delta, merged by `mergeDelta`.

**Polling is kept as a fallback, not as legacy.** If the stream fails — an old
browser, a proxy that buffers `text/event-stream` — the hook falls back to
`get-group-data` on a timer and retries the stream later. Vercel's `/api`
rewrite buffers streaming responses, which is why `VITE_API_ORIGIN` points the
stream straight at the API origin while every other request still goes through
the rewrite.

That one cross-origin call is why `connect-src` in `vercel.json` names the API
origin, and why the API's CORS list names the site.

## Config

| Variable | Purpose |
|---|---|
| `VITE_API_ORIGIN` | origin for the SSE stream. Empty in dev (Vite's proxy passes streams through); set in `vercel.json` for production. |
