import { describePool, withPoolSettings } from './prisma.service';

describe('withPoolSettings', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env.DB_POOL_SIZE = original.DB_POOL_SIZE;
    process.env.DB_POOL_TIMEOUT = original.DB_POOL_TIMEOUT;
    if (original.DB_POOL_SIZE === undefined) delete process.env.DB_POOL_SIZE;
    if (original.DB_POOL_TIMEOUT === undefined) {
      delete process.env.DB_POOL_TIMEOUT;
    }
  });

  it('adds the defaults when the URL carries no pool settings', () => {
    delete process.env.DB_POOL_SIZE;
    delete process.env.DB_POOL_TIMEOUT;

    const out = withPoolSettings(
      'postgresql://postgres:pw@127.0.0.1:5432/rs3_gim',
    );

    expect(out).toContain('connection_limit=20');
    expect(out).toContain('pool_timeout=15');
  });

  // Hosts inject DATABASE_URL, so an existing query string must survive.
  it('keeps existing query parameters', () => {
    const out = withPoolSettings('postgresql://u:p@h:5432/db?sslmode=require');

    expect(out).toContain('sslmode=require');
    expect(out).toContain('connection_limit=');
  });

  it('never overrides a connection_limit already in the URL', () => {
    const out = withPoolSettings(
      'postgresql://u:p@h:5432/db?connection_limit=5',
    );

    expect(out).toContain('connection_limit=5');
    expect(out).not.toContain('connection_limit=20');
  });

  it('honours DB_POOL_SIZE and DB_POOL_TIMEOUT', () => {
    process.env.DB_POOL_SIZE = '42';
    process.env.DB_POOL_TIMEOUT = '7';

    const out = withPoolSettings('postgresql://u:p@h:5432/db');

    expect(out).toContain('connection_limit=42');
    expect(out).toContain('pool_timeout=7');
  });

  it('leaves an unparseable URL untouched rather than risk breaking it', () => {
    expect(withPoolSettings('not a url')).toBe('not a url');
  });
});

describe('describePool', () => {
  it('reports the limit actually present in the URL', () => {
    expect(describePool('postgresql://u:p@h:5432/db?connection_limit=20')).toBe(
      'connection_limit=20',
    );
  });

  // The important case: settings silently not applied must not look applied.
  it('says so when no limit was applied', () => {
    expect(describePool('postgresql://u:p@h:5432/db')).toContain(
      'Prisma default',
    );
  });

  it('reports a missing DATABASE_URL', () => {
    expect(describePool(null)).toBe('no DATABASE_URL');
  });
});
