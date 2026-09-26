// Builds the production .env from apps/api/.env.example plus the environment.
//
//   node deploy/render-env.mjs <path-to-.env.example> <out-file>
//
// The workflow maps each secret into an explicit `env:` entry, so a new
// variable means a line in .env.example and a line in the workflow. Reading
// `toJSON(secrets)` instead would hand the job every secret at once — the
// pattern GitHub's scanner flags, and rightly.
//
// DATABASE_URL is skipped: it is generated on the server and should never
// reach GitHub.
import { readFileSync, writeFileSync } from 'node:fs';

const [examplePath, outPath] = process.argv.slice(2);
if (!examplePath || !outPath) {
  console.error('usage: render-env.mjs <.env.example> <out>');
  process.exit(1);
}

/** Keys the server owns. Anything supplied for these is ignored. */
const SERVER_OWNED = new Set(['DATABASE_URL', 'PORT']);

/** Never copy deploy plumbing into application config. */
const isNotAppConfig = (key) =>
  /^(SSH_|GITHUB_|ACTIONS_|RUNNER_|CI$)/i.test(key);

const example = readFileSync(examplePath, 'utf8');

const lines = [
  '# Generated at deploy time by deploy/render-env.mjs — do not edit by hand.',
  '# Keys come from apps/api/.env.example; values from the deploy environment.',
  `# Rendered: ${new Date().toISOString()}`,
  '',
];

let fromEnv = 0;
let fromExample = 0;
let keys = 0;

for (const rawLine of example.split('\n')) {
  const line = rawLine.trim();
  // Preserve comments and blank lines so the deployed file reads like the
  // template it came from.
  if (!line || line.startsWith('#')) {
    lines.push(rawLine.trimEnd());
    continue;
  }

  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
  if (!match) {
    lines.push(rawLine.trimEnd());
    continue;
  }

  const key = match[1];
  // Strip quotes from the example default; systemd's EnvironmentFile would
  // otherwise treat them as part of the value.
  const fallback = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  keys++;

  if (SERVER_OWNED.has(key)) {
    lines.push(`# ${key} is set on the server, not from the deploy.`);
    continue;
  }
  if (isNotAppConfig(key)) continue;

  const supplied = process.env[key];
  // A newline cannot be represented in an EnvironmentFile: systemd would read
  // the rest as separate assignments. Refuse rather than corrupt the file.
  if (typeof supplied === 'string' && /[\r\n]/.test(supplied)) {
    console.error(`::error::${key} contains a newline and cannot go in .env`);
    process.exit(1);
  }

  if (typeof supplied === 'string' && supplied.length > 0) {
    lines.push(`${key}=${supplied}`);
    fromEnv++;
  } else {
    lines.push(`${key}=${fallback}`);
    if (fallback) fromExample++;
  }
}

writeFileSync(outPath, lines.join('\n') + '\n', { mode: 0o600 });

// Counts only — never values.
console.log(
  `rendered ${outPath}: ${keys} keys from .env.example ` +
    `(${fromEnv} supplied, ${fromExample} using example defaults)`,
);
