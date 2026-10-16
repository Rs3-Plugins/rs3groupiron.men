/**
 * Member colours offered as one-click swatches. Anything outside this set is a
 * custom colour and is shown on the rainbow button instead.
 *
 * Four of the handoff's five: dropping one buys the room for the hex to sit on
 * the same line as the swatches. The one dropped is its gold, #c9a043, which
 * is within a few points of the UI's own --gold and so made a member hard to
 * pick out from the chrome. It is still reachable through the custom picker.
 */
export const MEMBER_COLORS = [
  '#5b9bd0',
  '#6fb36a',
  '#c0605a',
  '#9a7fd0',
] as const;

export type Hsv = { h: number; s: number; v: number };

export function isPresetColor(hex: string) {
  return (MEMBER_COLORS as readonly string[]).includes(hex.toLowerCase());
}

/** True for "#rrggbb" only: the picker's input accepts nothing shorter. */
export function isHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function hexToHsv(hex: string): Hsv {
  const clean = isHex(hex) ? hex : '#000000';
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const byte = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
