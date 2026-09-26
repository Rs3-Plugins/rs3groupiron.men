// Throwaway local Postgres for development when Docker isn't available.
// Matches the credentials in apps/api/.env.example.
//
//   pnpm dev:db          (from the repo root; installs on first run)
//
// Ctrl+C stops it. Data persists in tools/dev-db/.pgdata between runs.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseDir = join(dirname(fileURLToPath(import.meta.url)), '.pgdata');
const fresh = !existsSync(databaseDir);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'rs3',
  password: 'rs3dev',
  port: 5432,
  persistent: true,
  onLog: () => {},
  onError: (msg) => console.error(String(msg)),
});

if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('rs3_gim');
console.log('postgres ready on 127.0.0.1:5432 (db rs3_gim, user rs3)');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
