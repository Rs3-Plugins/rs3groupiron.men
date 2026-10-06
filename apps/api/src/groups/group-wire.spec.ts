import { ONLINE_STALE_MS, isOnline } from './group-wire';

describe('isOnline', () => {
  const now = Date.UTC(2026, 0, 1, 12, 0, 0);
  const seenAgo = (ms: number) => new Date(now - ms);

  it('is online while the plugin has been heard from recently', () => {
    expect(isOnline({ online: true, lastUpdated: seenAgo(60_000) }, now)).toBe(
      true,
    );
  });

  it('goes offline once the plugin has been quiet too long', () => {
    expect(
      isOnline({ online: true, lastUpdated: seenAgo(ONLINE_STALE_MS) }, now),
    ).toBe(false);
  });

  it('never reports an explicitly offline member as online', () => {
    expect(isOnline({ online: false, lastUpdated: seenAgo(0) }, now)).toBe(
      false,
    );
  });
});
