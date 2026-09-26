import {
  bucketSeries,
  bucketSizeMs,
  type SamplePoint,
} from './xp-history.service';

const HOUR = 60 * 60 * 1000;

const FROM = new Date('2026-09-25T11:00:00.000Z');
const TO = new Date('2026-09-26T11:00:00.000Z');

function steadySamples(from: Date, hours: number): Map<string, SamplePoint[]> {
  const points: SamplePoint[] = [];
  for (let i = 0; i <= hours; i++) {
    points.push({ t: from.getTime() + i * HOUR, xp: 5000 + i * 1000 });
  }
  return new Map([['attack', points]]);
}

describe('bucketSizeMs', () => {
  it('buckets a day by the hour', () => {
    expect(bucketSizeMs('24h')).toBe(HOUR);
  });
});

describe('bucketSeries', () => {
  const bySkill = steadySamples(FROM, 24);
  const series = bucketSeries(bySkill, ['attack'], FROM, TO, bucketSizeMs('24h'));

  it('starts at `from`, so the axis covers the whole requested window', () => {
    expect(series[0]!.t).toBe(FROM.toISOString());
  });

  it('ends at `to`', () => {
    expect(series[series.length - 1]!.t).toBe(TO.toISOString());
  });

  it('spans the full period rather than one bucket short', () => {
    const first = new Date(series[0]!.t).getTime();
    const last = new Date(series[series.length - 1]!.t).getTime();
    expect(last - first).toBe(24 * HOUR);
  });

  it('emits one point per bucket boundary with no duplicates', () => {
    expect(series).toHaveLength(25);
    expect(new Set(series.map((p) => p.t)).size).toBe(series.length);
  });

  it('is ordered', () => {
    const times = series.map((p) => new Date(p.t).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('opens at zero gain and accumulates from the baseline', () => {
    expect(series[0]!.gain).toBe(0);
    expect(series[1]!.gain).toBe(1000);
    expect(series[series.length - 1]!.gain).toBe(24_000);
  });

  it('never reports a negative gain when xp goes backwards', () => {
    const dropped = new Map<string, SamplePoint[]>([
      [
        'attack',
        [
          { t: FROM.getTime(), xp: 9000 },
          { t: FROM.getTime() + HOUR, xp: 1000 },
        ],
      ],
    ]);
    const points = bucketSeries(dropped, ['attack'], FROM, TO, bucketSizeMs('24h'));
    expect(points.every((p) => p.gain >= 0)).toBe(true);
  });

  it('still brackets the window when no samples exist', () => {
    const points = bucketSeries(new Map(), ['attack'], FROM, TO, bucketSizeMs('24h'));
    expect(points[0]!.t).toBe(FROM.toISOString());
    expect(points[points.length - 1]!.t).toBe(TO.toISOString());
    expect(points.every((p) => p.gain === 0)).toBe(true);
  });
});
