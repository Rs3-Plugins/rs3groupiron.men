// Ramped load test against a deployed API. No dependencies — plain `node`.
//
// WRITES TO THE TARGET DATABASE. It creates one group named LT-<base36 ts> and
// fills it with realistic member data, because the demo group is too small to
// show what a real group costs. There is no delete-group endpoint, so the group
// persists until you remove it:
//
//   DELETE FROM groups WHERE name LIKE 'LT-%';
//
//   node tools/perf/loadtest.mjs --url https://host [--steps 1,5,10,20] [--step-seconds 45]
//   node tools/perf/loadtest.mjs --url https://host --group LT-ABC123 --token <tok>   # reuse
//
// Each step runs `viewers` simulated browser tabs polling get-group-data at the
// real site's cadence, plus plugin writers pushing player-moved and member
// updates. Latency is reported per step so the knee is visible.

const args = process.argv.slice(2);
function flag(name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = args[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
}

const baseUrl = String(flag('url', '') || '').replace(/\/+$/, '');
// 0 is allowed so a step can isolate one side of the workload.
const steps = String(flag('steps', '1,5,10,20'))
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0);
/** Overrides the viewer-derived plugin count; 0 runs reads with no writes. */
const pluginsFlag = flag('plugins');
/**
 * Delta polls ask for partial members, which is what the site does. Pass
 * --no-split to measure the legacy all-or-nothing behaviour for comparison.
 */
const useSplit = flag('no-split') !== true;
const stepSeconds = Number(flag('step-seconds', 45));
const pollMs = Number(flag('poll', 1500));
const bankItems = Number(flag('bank-items', 1500));
/**
 * Make every plugin push byte-identical, which is what a real plugin does: it
 * resyncs on a schedule whether or not anything moved. Without this the
 * generator randomises skills and inventories on every tick, so the server
 * cannot tell a genuine change from a resend and no change-detection path on
 * the server is exercised.
 */
const stableWrites = flag('stable-writes') === true;
let groupName = flag('group');
let token = flag('token');

if (!baseUrl) {
  console.error('usage: node tools/perf/loadtest.mjs --url <https://host> [--steps 1,5,10,20]');
  process.exit(1);
}

/**
 * Polls between a viewer's periodic full refreshes, mirroring the web client.
 * --full-every 0 disables them, which isolates the delta path: a knee that
 * disappears when full refreshes stop was caused by the full refreshes.
 */
const FULL_REFRESH_EVERY_N_POLLS = Number(flag('full-every', 20));
const SKILLS = 'attack constitution mining strength agility smithing defence herblore fishing ranged thieving cooking prayer crafting firemaking magic fletching woodcutting runecrafting slayer farming construction hunter summoning dungeoneering divination invention archaeology necromancy'.split(' ');
const MEMBERS = ['LT_Alpha', 'LT_Bravo', 'LT_Charlie', 'LT_Delta', 'LT_Echo'];

const api = (path) => `${baseUrl}/api${path}`;
const groupPath = () => `/group/${encodeURIComponent(String(groupName))}`;

let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
  console.log('\ninterrupted');
});

function seedHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Deterministic pseudo-random so runs are comparable. */
let seed = 1337;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const randInt = (min, max) => min + Math.floor(rnd() * (max - min + 1));

async function send(method, path, body, useToken = true) {
  const startedAt = performance.now();
  try {
    const res = await fetch(api(path), {
      method,
      headers: {
        'content-type': 'application/json',
        ...(useToken && token ? { Authorization: String(token) } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const buf = await res.arrayBuffer();
    // Set by ServerTimingInterceptor. Absent means the request never reached
    // the API (proxy/CDN answered) or the deploy predates the interceptor.
    const serverHeader = res.headers.get('x-response-time-ms');
    return {
      ms: performance.now() - startedAt,
      serverMs: serverHeader === null ? null : Number(serverHeader),
      status: res.status,
      bytes: buf.byteLength,
      html: (res.headers.get('content-type') ?? '').includes('text/html'),
      text: buf.byteLength < 2000 ? Buffer.from(buf).toString('utf8') : '',
    };
  } catch (err) {
    return {
      ms: performance.now() - startedAt,
      status: 0,
      bytes: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * A member's bank, derived only from their index so every call produces the
 * identical payload. Real plugins resend the whole bank on a schedule whether
 * or not it changed, which is the case the server's content hash short-circuits
 * — randomising it here would make that path untestable.
 */
function stableBank(i) {
  const out = [];
  for (let n = 1; n <= bankItems; n++) {
    out.push(((i * 7919 + n * 31) % 29000) + 1, ((n * 17) % 1_000_000) + 1);
  }
  return out;
}

/** A believable late-game account: high xp, full inventory, big bank. */
function memberPayload(name, i) {
  // Derived from the member index alone under --stable-writes, so repeated calls
  // produce identical bytes.
  const pick = (seedParts, min, max) =>
    stableWrites
      ? min + (seedHash(seedParts) % (max - min + 1))
      : randInt(min, max);

  const skills = {};
  for (const id of SKILLS) {
    skills[id] = {
      xp: pick(`${i}:${id}:xp`, 1_000_000, 50_000_000),
      level: pick(`${i}:${id}:lvl`, 70, 99),
      baseLevel: pick(`${i}:${id}:base`, 70, 99),
    };
  }
  const pairs = (count, maxQty, tag) => {
    const out = [];
    for (let n = 0; n < count; n++) {
      out.push(
        pick(`${i}:${tag}:${n}:id`, 1, 30000),
        pick(`${i}:${tag}:${n}:q`, 1, maxQty),
      );
    }
    return out;
  };
  return {
    name,
    stats: [
      pick(`${i}:hp`, 500, 990), 990,
      pick(`${i}:pray`, 400, 800), 800,
      pick(`${i}:summ`, 0, 60), 60,
      pick(`${i}:world`, 1, 200),
    ],
    // Position still moves under --stable-writes: a player walking is a real
    // change, and it is the light half of the delta that should stay cheap.
    coordinates: [randInt(2000, 3500), randInt(3000, 3800), 0],
    inventory: pairs(28, 1000, 'inv'),
    equipment: pairs(13, 1, 'worn'),
    bank: stableBank(i),
    shared_bank:
      i === 0 ? pairs(Math.floor(bankItems / 3), 500_000, 'shared') : undefined,
    skills,
    last_updated: new Date().toISOString(),
  };
}

async function setup() {
  if (groupName && token) {
    console.log(`reusing existing group ${groupName}`);
    return;
  }
  // Group names are capped at 16 characters, so the timestamp is base36.
  groupName = `LT-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  console.log(`creating group ${groupName} ...`);

  const created = await send(
    'POST',
    '/create-group',
    { name: groupName, member_slots: MEMBERS.length, member_names: MEMBERS },
    false,
  );
  if (created.status !== 201) {
    console.error(`create-group failed: ${created.status} ${created.text || created.error || ''}`);
    process.exit(1);
  }
  token = JSON.parse(created.text).token;
  console.log(`created in ${created.ms.toFixed(0)}ms`);
  // Printed so a later run can reuse this group instead of creating another;
  // it is a throwaway load-test group, not a real credential.
  console.log(`  reuse with: --group ${groupName} --token ${token}`);

  // Seed each member separately; a full bank is a big body and the plugin
  // pushes them one member at a time anyway.
  for (let i = 0; i < MEMBERS.length; i++) {
    const payload = memberPayload(MEMBERS[i], i);
    const size = JSON.stringify(payload).length;
    const r = await send('POST', `${groupPath()}/update-group-member`, payload);
    console.log(
      `  seed ${MEMBERS[i].padEnd(12)} ${(size / 1024).toFixed(0).padStart(4)} KiB body -> ` +
        `${r.status} in ${r.ms.toFixed(0)}ms`,
    );
    if (r.status !== 200) {
      console.error(`  seeding failed: ${r.text || r.error || ''}`);
      process.exit(1);
    }
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** One simulated browser tab, mirroring apps/web/src/hooks/useGroupData.ts. */
async function viewer(id, endAt, bucket) {
  let polls = 0;
  await new Promise((r) => setTimeout(r, (pollMs / 8) * (id % 8)));
  while (!stopping && performance.now() < endAt) {
    const startedAt = performance.now();
    const full =
      FULL_REFRESH_EVERY_N_POLLS > 0 &&
      polls % FULL_REFRESH_EVERY_N_POLLS === 0;
    const since = new Date(Date.now() - pollMs * 2).toISOString();
    const query = new URLSearchParams({ from_time: since });
    if (useSplit) query.set('split', '1');
    const r = await send(
      'GET',
      full
        ? `${groupPath()}/get-group-data`
        : `${groupPath()}/get-group-data?${query}`,
    );
    (full ? bucket.full : bucket.delta).push(r);
    polls++;
    const elapsed = performance.now() - startedAt;
    if (elapsed < pollMs) await new Promise((r2) => setTimeout(r2, pollMs - elapsed));
  }
}

/** A logged-in plugin: frequent position pings, occasional stat pushes. */
async function plugin(id, endAt, bucket) {
  const name = MEMBERS[id % MEMBERS.length];
  let ticks = 0;
  while (!stopping && performance.now() < endAt) {
    const startedAt = performance.now();
    if (ticks % 10 === 9) {
      // Full sync including the bank, byte-identical each time: what a real
      // plugin sends, and the case the server should recognise and skip.
      const p = memberPayload(name, id % MEMBERS.length);
      p.bank = stableBank(id % MEMBERS.length);
      bucket.write.push(await send('POST', `${groupPath()}/update-group-member`, p));
    } else {
      bucket.move.push(
        await send('POST', `${groupPath()}/player-moved`, {
          name,
          coordinates: [randInt(2000, 3500), randInt(3000, 3800), 0],
        }),
      );
    }
    ticks++;
    const elapsed = performance.now() - startedAt;
    if (elapsed < 1000) await new Promise((r) => setTimeout(r, 1000 - elapsed));
  }
}

/** One response body per failure kind, so a 500 says what actually broke. */
const sampleBodies = new Map();

function summarize(label, rows) {
  const ok = rows.filter((r) => r.status === 200 || r.status === 201);
  const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
  const srv = ok
    .map((r) => r.serverMs)
    .filter((v) => typeof v === 'number')
    .sort((a, b) => a - b);
  const bad = rows.length - ok.length;
  if (!rows.length) return null;
  return {
    label,
    n: rows.length,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    p99: percentile(ms, 99),
    max: ms[ms.length - 1] ?? 0,
    srv50: percentile(srv, 50),
    srv99: percentile(srv, 99),
    hasSrv: srv.length > 0,
    kib: ok.length ? ok[Math.floor(ok.length / 2)].bytes / 1024 : 0,
    bad,
    // A bare error count is not actionable: a client-side socket failure and a
    // server 503 mean opposite things. status 0 is fetch() itself throwing, so
    // the request never reached the API.
    failures: rows
      .filter((r) => r.status !== 200 && r.status !== 201)
      .reduce((acc, r) => {
        const key =
          r.status === 0 ? `client:${r.error ?? 'threw'}` : `http ${r.status}`;
        acc[key] = (acc[key] ?? 0) + 1;
        if (r.text && !sampleBodies.has(key)) sampleBodies.set(key, r.text.slice(0, 300));
        return acc;
      }, {}),
  };
}

async function runStep(viewers) {
  const bucket = { full: [], delta: [], move: [], write: [] };
  const endAt = performance.now() + stepSeconds * 1000;
  // Roughly one logged-in plugin per five viewers, capped at the member count,
  // unless --plugins pins it (including 0, to isolate the read path).
  const plugins =
    pluginsFlag === undefined
      ? Math.min(MEMBERS.length, Math.max(1, Math.round(viewers / 5)))
      : Number(pluginsFlag);

  await Promise.all([
    ...Array.from({ length: viewers }, (_, i) => viewer(i, endAt, bucket)),
    ...Array.from({ length: plugins }, (_, i) => plugin(i, endAt, bucket)),
  ]);

  const rows = [
    summarize('get-group-data full', bucket.full),
    summarize('get-group-data delta', bucket.delta),
    summarize('player-moved', bucket.move),
    summarize('update-group-member', bucket.write),
  ].filter(Boolean);

  const reqs = bucket.full.length + bucket.delta.length + bucket.move.length + bucket.write.length;
  console.log(
    `\n--- ${viewers} viewer(s) + ${plugins} plugin(s), ${stepSeconds}s, ` +
      `${(reqs / stepSeconds).toFixed(1)} req/s ---`,
  );
  // srv* come from the server's own clock; total minus srv is network + proxy.
  console.log(
    'endpoint'.padEnd(23) + 'n'.padStart(6) + 'p50'.padStart(8) + 'p95'.padStart(8) +
      'p99'.padStart(8) + 'srv50'.padStart(8) + 'srv99'.padStart(8) +
      'KiB'.padStart(8) + 'err'.padStart(5),
  );
  for (const r of rows) {
    console.log(
      r.label.padEnd(23) + String(r.n).padStart(6) + r.p50.toFixed(0).padStart(8) +
        r.p95.toFixed(0).padStart(8) + r.p99.toFixed(0).padStart(8) +
        (r.hasSrv ? r.srv50.toFixed(0) : '-').padStart(8) +
        (r.hasSrv ? r.srv99.toFixed(0) : '-').padStart(8) +
        r.kib.toFixed(1).padStart(8) + String(r.bad).padStart(5),
    );
  }
  for (const r of rows) {
    const kinds = Object.entries(r.failures);
    if (kinds.length) {
      console.log(
        `  ${r.label} failures: ` +
          kinds.sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n}x ${k}`).join(', '),
      );
    }
  }
  for (const [kind, body] of sampleBodies) {
    console.log(`  sample ${kind}: ${body}`);
  }
  sampleBodies.clear();
  if (rows.length && !rows.some((r) => r.hasSrv)) {
    console.log('  (no X-Response-Time-Ms header — server timing not deployed yet)');
  }
  return { viewers, plugins, reqs, rows };
}

await setup();
console.log(`\ntarget ${baseUrl}  group ${groupName}`);
console.log(`ramp: ${steps.join(' -> ')} viewers, ${stepSeconds}s each\n`);

const history = [];
for (const v of steps) {
  if (stopping) break;
  history.push(await runStep(v));
}

for (const label of ['get-group-data delta', 'player-moved']) {
  console.log(`\n================ RAMP SUMMARY (${label}) ================`);
  console.log(
    'viewers'.padEnd(9) + 'req/s'.padStart(8) + 'p50'.padStart(8) +
      'p99'.padStart(8) + 'srv50'.padStart(8) + 'srv99'.padStart(8) + 'err'.padStart(5),
  );
  for (const h of history) {
    const d = h.rows.find((r) => r.label === label);
    if (!d) continue;
    console.log(
      String(h.viewers).padEnd(9) + (h.reqs / stepSeconds).toFixed(1).padStart(8) +
        d.p50.toFixed(0).padStart(8) + d.p99.toFixed(0).padStart(8) +
        (d.hasSrv ? d.srv50.toFixed(0) : '-').padStart(8) +
        (d.hasSrv ? d.srv99.toFixed(0) : '-').padStart(8) +
        String(d.bad).padStart(5),
    );
  }
}
console.log(`\ngroup ${groupName} still exists. Remove with:`);
console.log(`  DELETE FROM groups WHERE name LIKE 'LT-%';`);
