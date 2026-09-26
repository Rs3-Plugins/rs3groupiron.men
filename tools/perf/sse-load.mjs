// Concurrent SSE capacity. Polling costs a request per viewer per tick; a
// stream costs a socket, and one change is built once and fanned out. This
// measures the second number, which is the one that decides how many viewers a
// single instance can carry.
//
//   node tools/perf/sse-load.mjs --url https://host --group NAME --token TOK \
//     [--viewers 500] [--seconds 30] [--writer]
//
// --writer pushes a player-moved every second so deltas actually flow; without
// it the run only measures how many idle streams stay up.
import http from 'node:http';
import https from 'node:https';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  if (i === -1) return d;
  const next = args[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
};

const baseUrl = String(flag('url', '')).replace(/\/+$/, '');
const groupName = String(flag('group', 'Demo Group'));
const token = flag('token');
const viewers = Number(flag('viewers', 500));
const seconds = Number(flag('seconds', 30));
const withWriter = flag('writer') === true;
if (!baseUrl) { console.error('need --url'); process.exit(1); }

const streamUrl = `${baseUrl}/api/group/${encodeURIComponent(groupName)}/events`;
const movedUrl = `${baseUrl}/api/group/${encodeURIComponent(groupName)}/player-moved`;
const authHeaders = token ? { Authorization: String(token) } : {};

const stats = {
  opened: 0,
  refused: 0,
  /**
   * Got 200 but never a snapshot. Capacity is enforced after the response has
   * started, so a refused stream looks like a short-lived 200 carrying only an
   * error frame — this is the count that reflects the cap.
   */
  emptied: 0,
  failed: 0,
  snapshots: 0,
  deltas: 0,
  pings: 0,
  /** ms from connect to first frame, which is the snapshot build plus transfer. */
  firstFrameMs: [],
  bytes: 0,
};
const refusalCodes = new Map();

const endAt = performance.now() + seconds * 1000;
const controller = new AbortController();

async function stream() {
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(streamUrl, {
      headers: { Accept: 'text/event-stream', ...authHeaders },
      signal: controller.signal,
    });
  } catch {
    stats.failed++;
    return;
  }
  if (!res.ok) {
    stats.refused++;
    refusalCodes.set(res.status, (refusalCodes.get(res.status) ?? 0) + 1);
    return;
  }
  stats.opened++;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let first = true;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      stats.bytes += value.byteLength;
      if (first) {
        first = false;
        stats.firstFrameMs.push(performance.now() - t0);
      }
      buffer += decoder.decode(value, { stream: true });
      let cut;
      while ((cut = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, cut);
        buffer = buffer.slice(cut + 2);
        // Nest emits the event name on its own line; match that rather than
        // the JSON body, which can contain either word.
        if (/^event: ?snapshot$/m.test(frame)) stats.snapshots++;
        else if (/^event: ?delta$/m.test(frame)) stats.deltas++;
        else if (/^event: ?ping$/m.test(frame) || frame.startsWith(':')) stats.pings++;
      }
    }
  } catch {
    /* aborted at the end of the run, or the peer closed */
  }
}

async function writer() {
  while (performance.now() < endAt) {
    try {
      await fetch(movedUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          name: 'LT_Alpha',
          coordinates: [3000 + Math.floor(Math.random() * 400), 3200, 0],
        }),
      });
    } catch { /* counted by the viewers going quiet */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

console.log(`opening ${viewers} streams to ${streamUrl} for ${seconds}s ...`);
const rss0 = process.memoryUsage().rss;
const jobs = Array.from({ length: viewers }, stream);
if (withWriter) jobs.push(writer());

setTimeout(() => controller.abort(), seconds * 1000);
await Promise.allSettled(jobs);

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
};
console.log(`\n  opened        ${stats.opened}`);
console.log(`  refused       ${stats.refused}${
  refusalCodes.size
    ? ` (${[...refusalCodes].map(([c, n]) => `${n}x HTTP ${c}`).join(', ')})`
    : ''
}`);
console.log(`  failed        ${stats.failed}`);
console.log(`  no snapshot   ${stats.emptied}  (refused at capacity, or closed early)`);
console.log(`  streaming     ${stats.opened - stats.emptied}`);
console.log(`  snapshots     ${stats.snapshots}`);
console.log(`  deltas        ${stats.deltas}`);
console.log(`  pings         ${stats.pings}`);
console.log(
  `  first frame   p50 ${pct(stats.firstFrameMs, 50).toFixed(0)}ms` +
    `  p95 ${pct(stats.firstFrameMs, 95).toFixed(0)}ms` +
    `  p99 ${pct(stats.firstFrameMs, 99).toFixed(0)}ms`,
);
console.log(`  received      ${(stats.bytes / 1024 / 1024).toFixed(1)} MiB`);
console.log(`  client rss    +${((process.memoryUsage().rss - rss0) / 1024 / 1024).toFixed(0)} MiB`);
if (stats.opened) {
  console.log(
    `  per stream    ${(stats.bytes / stats.opened / 1024).toFixed(1)} KiB over ${seconds}s`,
  );
}
