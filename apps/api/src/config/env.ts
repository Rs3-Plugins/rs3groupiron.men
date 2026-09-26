/**
 * Boot-time environment validation.
 *
 * Runs before the Nest app is created so a misconfigured deploy fails loudly on
 * startup instead of at whichever request first needs the missing value. The
 * blue/green release script gates on the health check, so a process that exits
 * here never takes traffic.
 *
 * Infrastructure config stays where its owner reads it — Prisma takes
 * DATABASE_URL, the OpenTelemetry SDK reads its own OTEL_* contract, R2 has
 * readR2Config(). This module is for what the application itself branches on.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * POST /api/reset-fake-data truncates every table, so the flag is honoured
 * outside production only. assertEnv() already refuses to boot with it set in
 * production; this is the backstop if validation is ever bypassed.
 */
export function allowDevReset(): boolean {
  return !isProduction() && process.env.ALLOW_DEV_RESET === '1';
}

/**
 * Lets the otherwise read-only demo group be written to. Permitted in
 * production: it still takes the group's token, which only the operator can
 * read out of the database.
 */
export function demoWritable(): boolean {
  return process.env.DEMO_WRITABLE === '1';
}

/**
 * Opt in to seeding demo data in production. Safe to leave on — seeding only
 * runs when the database holds no groups at all.
 */
export function seedDemo(): boolean {
  return process.env.SEED_DEMO === '1';
}

export class EnvError extends Error {
  constructor(problems: string[]) {
    super(
      `Invalid environment:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
    this.name = 'EnvError';
  }
}

export function collectEnvProblems(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = [];
  const production = env.NODE_ENV === 'production';

  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    problems.push('DATABASE_URL is required');
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push('DATABASE_URL must be a postgresql:// connection string');
  }

  const port = env.PORT?.trim();
  if (port && !/^\d{1,5}$/.test(port)) {
    problems.push(`PORT must be a number (got ${JSON.stringify(port)})`);
  }

  // `trust proxy` accepting `true` would make X-Forwarded-For attacker
  // controlled, which forges the client IP the rate limiter keys on. Only the
  // documented hop count is allowed.
  const trustProxy = env.TRUST_PROXY?.trim();
  if (trustProxy && !/^\d+$/.test(trustProxy)) {
    problems.push(
      `TRUST_PROXY must be the number of proxy hops, not ${JSON.stringify(trustProxy)}`,
    );
  }

  for (const origin of (env.CORS_ORIGINS ?? '').split(',')) {
    const value = origin.trim();
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      problems.push(
        `CORS_ORIGINS entry is not a URL: ${JSON.stringify(value)}`,
      );
      continue;
    }
    if (`${parsed.origin}` !== value) {
      problems.push(
        `CORS_ORIGINS entry must be a bare origin with no path: ${JSON.stringify(value)}`,
      );
    }
  }

  // The endpoint it unlocks truncates every table, so a production deploy
  // carrying this flag is a mistake worth refusing to start on.
  if (production && env.ALLOW_DEV_RESET === '1') {
    problems.push('ALLOW_DEV_RESET=1 is not allowed when NODE_ENV=production');
  }

  return problems;
}

/** Throws {@link EnvError} listing every problem at once. */
export function assertEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems = collectEnvProblems(env);
  if (problems.length) throw new EnvError(problems);
}
