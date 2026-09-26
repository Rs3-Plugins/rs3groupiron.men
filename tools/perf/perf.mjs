// Latency probe for a deployed API. No dependencies — plain `node`.
//
// Read-only: it only issues GETs, so it cannot modify group data. Safe to point
// at production, though it does generate real load — start small.
//
//   node tools/perf/perf.mjs --url https://api.example.com --group "Demo Group"
//   node tools/perf/perf.mjs --url ... --group ... --token <token>
//
// Modes:
//   (default)   one request per endpoint, printed in order. Minimal impact —
//               run this first to see payload sizes and a latency floor.
//   --load      simulates browser viewers polling like the real site does:
//               get-group-data every 1.5s with from_time, and a full refresh
//               (no from_time) every 20th poll, matching apps/web/src/lib/polling.ts
//
// Load options:
//   --viewers N     concurrent simulated tabs (default 3)
//   --duration S    seconds to run (default 30)
//   --poll MS       poll interval (default 1500, the map tab's rate)
//
// Ctrl+C prints whatever has been collected so far.

const args = process.argv.slice(2);
function flag(name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
}

const baseUrl = String(flag('url', '') || '').replace(/\/+$/, '');
const group = String(flag('group', '') || '');
const token = flag('token');
const loadMode = flag('load') === true;
const viewers = Number(flag('viewers', 3));
const duration = Number(flag('duration', 30));
const pollMs = Number(flag('poll', 1500));

if (!baseUrl || !group) {
  console.error(
    'usage: node tools/perf/perf.mjs --url <https://host> --group "<name>" ' +
      '[--token <token>] [--load] [--viewers N] [--duration S] [--poll MS]',
  );
  process.exit(1);
}

const FULL_REFRESH_EVERY_N_POLLS = 20;
const groupPath = `${baseUrl}/api/group/${encodeURIComponent(group)}`;
const headers = typeof token === 'string' ? { Authorization: token } : {};

// Every read endpoint the site uses. `label` is what shows up in the report.
const ENDPOINTS = [
  { label: 'health', url: `${baseUrl}/health`, noAuth: true },
  { label: 'am-i-logged-in', url: `${groupPath}/am-i-logged-in` },
  { label: 'get-group-data (full)', url: `${groupPath}/get-group-data` },
  { label: 'xp-history 24h', url: `${groupPath}/xp-history?period=24h` },
  { label: 'xp-history 7d', url: `${groupPath}/xp-history?period=7d` },
  { label: 'xp-history 30d', url: `${groupPath}/xp-history?period=30d` },
  { label: 'achievements', url: `${groupPath}/achievements` },
  { label: 'bank-ledger', url: `${groupPath}/bank-ledger` },
  { label: 'quests', url: `${groupPath}/quests` },
];

/** label -> { ttfb[], total[], bytes[], statuses{}, errors[] } */
const stats = new Map();
function record(label, sample) {
  let s = stats.get(label);
  if (!s) {
    s = { ttfb: [], total: [], bytes: [], statuses: {}, errors: [] };
    stats.set(label, s);
  }
  if (sample.error) {
    s.errors.push(sample.error);
    return;
  }
  s.ttfb.push(sample.ttfb);
  s.total.push(sample.total);
  s.bytes.push(sample.bytes);
  if (typeof sample.serverMs === 'number') {
    (s.server ??= []).push(sample.serverMs);
  }
  s.statuses[sample.status] = (s.statuses[sample.status] ?? 0) + 1;
  if (sample.html) s.html = (s.html ?? 0) + 1;
}

async function probe(label, url, useAuth = true) {
  const startedAt = performance.now();
  try {
    const res = await fetch(url, {
      headers: useAuth ? headers : {},
      redirect: 'follow',
    });
    // Time to response headers vs. time to the last byte: a big gap between
    // them is payload size or a slow link, not server think-time.
    const ttfb = performance.now() - startedAt;
    const body = await res.arrayBuffer();
    // A static host fronting the API will answer unproxied paths with its SPA
    // index.html and a cheerful 200. Without this check that looks like a fast
    // endpoint instead of a request that never reached the API.
    const contentType = res.headers.get('content-type') ?? '';
    const html = contentType.includes('text/html');
    // Set by ServerTimingInterceptor; lets us subtract network from the total.
    const serverHeader = res.headers.get('x-response-time-ms');
    record(label, {
      ttfb,
      total: performance.now() - startedAt,
      serverMs: serverHeader === null ? null : Number(serverHeader),
      bytes: body.byteLength,
      status: res.status,
      html,
    });
    return html ? 'HTML' : res.status;
  } catch (err) {
    record(label, { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}
const fmtMs = (n) => n.toFixed(1).padStart(8);
const fmtKb = (n) => (n / 1024).toFixed(1).padStart(9);

function report() {
  const rows = [...stats.entries()];
  if (!rows.length) {
    console.log('\nno samples collected');
    return;
  }
  console.log(
    '\n' +
      'endpoint'.padEnd(24) +
      'n'.padStart(5) +
      'p50'.padStart(9) +
      'p95'.padStart(9) +
      'p99'.padStart(9) +
      'max'.padStart(9) +
      'srv50'.padStart(9) +
      'KiB'.padStart(10),
  );
  console.log('-'.repeat(84));
  // Slowest first: that is the thing to go fix.
  rows.sort(
    (a, b) =>
      percentile([...b[1].total].sort((x, y) => x - y), 50) -
      percentile([...a[1].total].sort((x, y) => x - y), 50),
  );
  for (const [label, s] of rows) {
    const total = [...s.total].sort((a, b) => a - b);
    const server = [...(s.server ?? [])].sort((a, b) => a - b);
    const bytes = [...s.bytes].sort((a, b) => a - b);
    console.log(
      label.padEnd(24) +
        String(total.length).padStart(5) +
        fmtMs(percentile(total, 50)) +
        fmtMs(percentile(total, 95)) +
        fmtMs(percentile(total, 99)) +
        fmtMs(total[total.length - 1] ?? 0) +
        (server.length ? fmtMs(percentile(server, 50)) : '        -') +
        fmtKb(percentile(bytes, 50)),
    );
    const bad = Object.entries(s.statuses).filter(([code]) => code !== '200');
    if (bad.length) {
      console.log(
        '  '.padEnd(24) +
          'non-200: ' +
          bad.map(([c, n]) => `${c}x${n}`).join(' '),
      );
    }
    if (s.errors.length) {
      const first = s.errors[0];
      console.log(
        '  '.padEnd(24) + `errors: ${s.errors.length} (first: ${first})`,
      );
    }
    if (s.html) {
      console.log(
        '  '.padEnd(24) +
          `!! ${s.html} HTML response(s) — this path is not proxied to the ` +
          'API, the numbers above are the static host',
      );
    }
  }
  console.log(
    '\np50/p95/p99/max and srv50 are milliseconds; KiB is the median response size.',
  );
  console.log(
    'srv50 is the server\'s own measurement; p50 minus srv50 is network + proxy.',
  );
  console.log(
    'A "-" in srv50 means the response carried no timing header.',
  );
}

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
  console.log('\ninterrupted — reporting what was collected');
  report();
  process.exit(0);
});

async function runOnce() {
  console.log(`probing ${baseUrl} (group: ${group})`);
  if (typeof token !== 'string') {
    console.log('no --token: only the public demo group will return data\n');
  }
  for (const e of ENDPOINTS) {
    const status = await probe(e.label, e.url, !e.noAuth);
    const s = stats.get(e.label);
    const last = s?.total.at(-1);
    const kib = s?.bytes.at(-1);
    console.log(
      `${status || 'ERR'}  ${e.label.padEnd(24)} ` +
        (last === undefined
          ? (s?.errors.at(-1) ?? '')
          : `${last.toFixed(1)}ms  ${(kib / 1024).toFixed(1)} KiB`),
    );
  }
  report();
}

/**
 * One simulated browser tab. Mirrors useGroupData: poll with `from_time`, and
 * drop it every 20th poll so the server rebuilds the whole payload.
 */
async function viewer(id, endAt) {
  let polls = 0;
  // Stagger start so viewers do not all fire in lockstep.
  await new Promise((r) => setTimeout(r, (pollMs / viewers) * id));

  while (!stopping && performance.now() < endAt) {
    const startedAt = performance.now();
    const full = polls % FULL_REFRESH_EVERY_N_POLLS === 0;
    const since = new Date(Date.now() - pollMs * 2).toISOString();
    await probe(
      full ? 'get-group-data (full)' : 'get-group-data (delta)',
      full
        ? `${groupPath}/get-group-data`
        : `${groupPath}/get-group-data?from_time=${encodeURIComponent(since)}`,
    );
    polls++;

    // Keep the cadence fixed rather than sleeping a flat interval, so a slow
    // response eats into the gap instead of lowering the request rate.
    const elapsed = performance.now() - startedAt;
    if (elapsed < pollMs) {
      await new Promise((r) => setTimeout(r, pollMs - elapsed));
    }
  }
}

async function runLoad() {
  console.log(
    `load: ${viewers} viewer(s), ${duration}s, poll every ${pollMs}ms ` +
      `(full refresh every ${FULL_REFRESH_EVERY_N_POLLS} polls)`,
  );
  console.log(`target ${baseUrl} (group: ${group})\n`);
  const endAt = performance.now() + duration * 1000;
  await Promise.all(
    Array.from({ length: viewers }, (_, i) => viewer(i, endAt)),
  );
  report();
}

await (loadMode ? runLoad() : runOnce());
