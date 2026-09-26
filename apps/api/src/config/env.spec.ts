import { assertEnv, collectEnvProblems } from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
} satisfies NodeJS.ProcessEnv;

describe('collectEnvProblems', () => {
  it('accepts a minimal valid environment', () => {
    expect(collectEnvProblems(valid)).toEqual([]);
  });

  it('requires DATABASE_URL', () => {
    expect(collectEnvProblems({})).toContain('DATABASE_URL is required');
  });

  it('rejects a DATABASE_URL that is not postgres', () => {
    const problems = collectEnvProblems({
      DATABASE_URL: 'mysql://u:p@localhost/db',
    });
    expect(problems.join()).toContain('postgresql://');
  });

  it('rejects a non-numeric PORT', () => {
    expect(collectEnvProblems({ ...valid, PORT: 'http' }).join()).toContain(
      'PORT must be a number',
    );
  });

  // The whole point of the check: `true` makes express trust every hop, so a
  // client can forge X-Forwarded-For and defeat the rate limiter's keying.
  it.each(['true', '*', 'loopback'])(
    'rejects TRUST_PROXY=%s because it is not a hop count',
    (value) => {
      expect(
        collectEnvProblems({ ...valid, TRUST_PROXY: value }).join(),
      ).toContain('TRUST_PROXY must be the number of proxy hops');
    },
  );

  it('accepts a TRUST_PROXY hop count', () => {
    expect(collectEnvProblems({ ...valid, TRUST_PROXY: '1' })).toEqual([]);
  });

  it('rejects a CORS origin carrying a path', () => {
    expect(
      collectEnvProblems({
        ...valid,
        CORS_ORIGINS: 'https://example.com/app',
      }).join(),
    ).toContain('bare origin');
  });

  it('accepts a comma separated origin list with stray whitespace', () => {
    expect(
      collectEnvProblems({
        ...valid,
        CORS_ORIGINS: 'https://a.example , https://b.example',
      }),
    ).toEqual([]);
  });

  it('refuses the destructive reset flag in production', () => {
    expect(
      collectEnvProblems({
        ...valid,
        NODE_ENV: 'production',
        ALLOW_DEV_RESET: '1',
      }).join(),
    ).toContain('ALLOW_DEV_RESET=1 is not allowed');
  });

  it('allows demo seeding in production, which is a supported setup', () => {
    expect(
      collectEnvProblems({ ...valid, NODE_ENV: 'production', SEED_DEMO: '1' }),
    ).toEqual([]);
  });

  it('reports every problem at once rather than the first', () => {
    expect(collectEnvProblems({ PORT: 'x', TRUST_PROXY: 'true' })).toHaveLength(
      3,
    );
  });
});

describe('assertEnv', () => {
  it('throws listing the problems', () => {
    expect(() => assertEnv({})).toThrow(/DATABASE_URL is required/);
  });

  it('passes a valid environment', () => {
    expect(() => assertEnv(valid)).not.toThrow();
  });
});
