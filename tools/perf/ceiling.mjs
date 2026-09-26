// How fast can THIS machine drive the target at all? Run before any load test:
// a knee that appears at the same rate as this ceiling is the rig, not the API.
//
//   node tools/perf/ceiling.mjs --url https://host [--concurrency 200] [--seconds 10]
const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const url = String(flag('url', '')).replace(/\/+$/, '');
const concurrency = Number(flag('concurrency', 200));
const seconds = Number(flag('seconds', 10));
if (!url) { console.error('need --url'); process.exit(1); }

// --path / is static JSON with no database work; /health adds a SELECT 1.
// Comparing the two separates the network path from the database.
const target = `${url}${flag('path', '/health')}`;
const lat = [];
let done = 0, errors = 0;
const endAt = performance.now() + seconds * 1000;

async function worker() {
  while (performance.now() < endAt) {
    const t0 = performance.now();
    try {
      const res = await fetch(target);
      await res.arrayBuffer();
      lat.push(performance.now() - t0);
      done++;
    } catch { errors++; }
  }
}

console.log(`flooding ${target} with ${concurrency} workers for ${seconds}s ...`);
const t0 = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsed = (performance.now() - t0) / 1000;
lat.sort((a, b) => a - b);
const pct = (p) => lat.length ? lat[Math.min(lat.length - 1, Math.ceil((p / 100) * lat.length) - 1)] : 0;
console.log(`  ${done} ok, ${errors} err in ${elapsed.toFixed(1)}s`);
console.log(`  throughput ${(done / elapsed).toFixed(0)} req/s`);
console.log(`  p50 ${pct(50).toFixed(0)}ms  p95 ${pct(95).toFixed(0)}ms  p99 ${pct(99).toFixed(0)}ms  max ${pct(100).toFixed(0)}ms`);
