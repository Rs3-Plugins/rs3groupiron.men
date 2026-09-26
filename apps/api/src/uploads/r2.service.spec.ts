import { ServiceUnavailableException } from '@nestjs/common';
import {
  R2Service,
  UPLOAD_MAX_BYTES_DEFAULT,
  folderForKind,
  readR2Config,
  uploadMaxBytes,
} from './r2.service';

const R2_ENV = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'CDN_BASE_URL',
  'UPLOAD_MAX_BYTES',
] as const;

const saved: Record<string, string | undefined> = {};

function configure(overrides: Record<string, string | undefined> = {}) {
  process.env.R2_ACCOUNT_ID = 'acct123';
  process.env.R2_ACCESS_KEY_ID = 'key123';
  process.env.R2_SECRET_ACCESS_KEY = 'secret123';
  process.env.R2_BUCKET = 'rs3-gim';
  process.env.CDN_BASE_URL = 'https://cdn.rs3groupiron.men';
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeAll(() => {
  for (const key of R2_ENV) saved[key] = process.env[key];
});

afterEach(() => {
  for (const key of R2_ENV) delete process.env[key];
});

afterAll(() => {
  for (const key of R2_ENV) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key]!;
  }
});

describe('folderForKind', () => {
  it('maps each achievement kind to its CDN folder', () => {
    expect(folderForKind('level')).toBe('levelups');
    expect(folderForKind('drop')).toBe('drops');
    expect(folderForKind('quest')).toBe('quests');
    expect(folderForKind('diary')).toBe('diaries');
    expect(folderForKind('other')).toBe('other');
  });

  it('falls back to other for anything unknown', () => {
    expect(folderForKind('nonsense')).toBe('other');
    expect(folderForKind('')).toBe('other');
  });
});

describe('uploadMaxBytes', () => {
  it('defaults when unset or nonsense', () => {
    expect(uploadMaxBytes()).toBe(UPLOAD_MAX_BYTES_DEFAULT);
    process.env.UPLOAD_MAX_BYTES = 'abc';
    expect(uploadMaxBytes()).toBe(UPLOAD_MAX_BYTES_DEFAULT);
    process.env.UPLOAD_MAX_BYTES = '-5';
    expect(uploadMaxBytes()).toBe(UPLOAD_MAX_BYTES_DEFAULT);
  });

  it('honours a configured cap', () => {
    process.env.UPLOAD_MAX_BYTES = '1048576';
    expect(uploadMaxBytes()).toBe(1_048_576);
  });
});

describe('readR2Config', () => {
  it('is null until every value is present', () => {
    expect(readR2Config()).toBeNull();
    configure({ R2_BUCKET: undefined });
    expect(readR2Config()).toBeNull();
  });

  it('strips a trailing slash from the public base url', () => {
    configure({ CDN_BASE_URL: 'https://cdn.rs3groupiron.men/' });
    expect(readR2Config()?.publicBaseUrl).toBe('https://cdn.rs3groupiron.men');
  });
});

describe('R2Service.presignAchievementImage', () => {
  it('reports unconfigured rather than throwing on boot', async () => {
    const service = new R2Service();
    expect(service.isConfigured()).toBe(false);
    await expect(
      service.presignAchievementImage({
        groupId: 'g1',
        kind: 'level',
        contentLength: 100,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('builds a server-chosen key under the group and kind folder', async () => {
    configure();
    const service = new R2Service();
    expect(service.isConfigured()).toBe(true);
    const result = await service.presignAchievementImage({
      groupId: 'grp_abc',
      kind: 'quest',
      contentLength: 2048,
    });

    expect(result.key).toMatch(
      /^achievements\/grp_abc\/quests\/[0-9a-f-]{36}\.png$/,
    );
    expect(result.public_url).toBe(
      `https://cdn.rs3groupiron.men/${result.key}`,
    );
    expect(result.method).toBe('PUT');
    expect(result.headers['Content-Type']).toBe('image/png');
    expect(result.headers['Content-Length']).toBe('2048');
  });

  it('signs content-type and content-length so they cannot be swapped', async () => {
    configure();
    const result = await new R2Service().presignAchievementImage({
      groupId: 'grp_abc',
      kind: 'drop',
      contentLength: 4096,
    });
    const url = new URL(result.upload_url);
    const signed = url.searchParams.get('X-Amz-SignedHeaders');
    expect(signed).toContain('content-type');
    expect(signed).toContain('content-length');
    // Virtual-host addressing: <bucket>.<account>.r2.cloudflarestorage.com
    expect(url.host).toBe('rs3-gim.acct123.r2.cloudflarestorage.com');
  });

  it('does not pin a body checksum into the URL', async () => {
    // The SDK would otherwise sign a CRC32 of an empty body, which makes the
    // real upload fail with a checksum mismatch.
    configure();
    const result = await new R2Service().presignAchievementImage({
      groupId: 'g',
      kind: 'level',
      contentLength: 128,
    });
    const params = new URL(result.upload_url).searchParams;
    for (const [key] of params) {
      expect(key.toLowerCase()).not.toContain('checksum');
    }
  });

  it('never reuses a key', async () => {
    configure();
    const service = new R2Service();
    const a = await service.presignAchievementImage({
      groupId: 'g',
      kind: 'level',
      contentLength: 10,
    });
    const b = await service.presignAchievementImage({
      groupId: 'g',
      kind: 'level',
      contentLength: 10,
    });
    expect(a.key).not.toBe(b.key);
  });
});
