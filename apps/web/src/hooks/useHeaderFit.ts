import { useLayoutEffect, useRef, useState } from 'react';

export type HeaderFit = {
  icon: boolean;
  text: boolean;
  group: boolean;
  logout: boolean;
  count: number;
  burger: boolean;
};

const GROUP_GAP = 24;
const BRAND_GAP = 10;
const NAV_GAP = 2;
const RIGHT_GAP = 4;

const EVERYTHING: HeaderFit = {
  icon: true,
  text: true,
  group: true,
  logout: true,
  count: Number.MAX_SAFE_INTEGER,
  burger: false,
};

type Widths = {
  logo: number;
  word: number;
  pill: number;
  nav: number[];
  more: number;
  settings: number;
  logout: number;
};

function widthsOf(el: HTMLElement) {
  return Array.from(el.children).map((c) => c.getBoundingClientRect().width);
}

function navFit(widths: number[], avail: number, moreW: number) {
  const all = widths.reduce((a, b) => a + b, 0) + NAV_GAP * Math.max(0, widths.length - 1);
  if (all <= avail) return widths.length;
  let acc = 0;
  let count = 0;
  for (const w of widths) {
    if (acc + w + NAV_GAP * (count + 1) + moreW > avail) break;
    acc += w;
    count += 1;
  }
  return count;
}

function solve(w: Widths, avail: number): HeaderFit {
  const n = w.nav.length;
  let icon = true;
  let text = true;
  let group = true;
  let logout = true;

  const need = () => {
    const brand =
      icon || text
        ? (icon ? w.logo : 0) + (text ? w.word : 0) + (icon && text ? BRAND_GAP : 0) + GROUP_GAP
        : 0;
    const pill = group ? w.pill + GROUP_GAP : 0;
    const right = w.settings + (logout ? w.logout + RIGHT_GAP : 0) + GROUP_GAP;
    return brand + pill + right;
  };

  const fit = () => navFit(w.nav, Math.max(0, avail - need()), w.more);

  for (const step of ['icon', 'text', 'group'] as const) {
    if (fit() === n) break;
    if (step === 'icon') icon = false;
    else if (step === 'text') text = false;
    else group = false;
  }

  let count = fit();
  let burger = count < 2;
  if (burger) {
    count = 0;
    logout = false;
  } else if (count < n && avail - need() < w.more + w.nav[0]!) {
    // Reclaiming Log out is what buys room for the More button plus one link.
    logout = false;
    count = fit();
    burger = count < 2;
    if (burger) count = 0;
  }

  return { icon, text, group, logout, count, burger };
}

export function useHeaderFit(navCount: number, enabled: boolean) {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<HeaderFit>(EVERYTHING);

  useLayoutEffect(() => {
    if (!enabled) {
      setFit(EVERYTHING);
      return;
    }
    const row = rowRef.current;
    const measure = measureRef.current;
    if (!row || !measure) return;

    const recompute = () => {
      const all = widthsOf(measure);
      // logo, wordmark, group pill, every nav link, More, Settings, Log out.
      if (all.length !== navCount + 6) return;
      const style = getComputedStyle(row);
      const avail =
        row.clientWidth -
        Number.parseFloat(style.paddingLeft || '0') -
        Number.parseFloat(style.paddingRight || '0');
      if (avail <= 0) return;
      const widths: Widths = {
        logo: all[0]!,
        word: all[1]!,
        pill: all[2]!,
        nav: all.slice(3, 3 + navCount),
        more: all[3 + navCount]!,
        settings: all[4 + navCount]!,
        logout: all[5 + navCount]!,
      };
      const next = solve(widths, avail);
      setFit((prev) =>
        prev.icon === next.icon &&
        prev.text === next.text &&
        prev.group === next.group &&
        prev.logout === next.logout &&
        prev.count === next.count &&
        prev.burger === next.burger
          ? prev
          : next,
      );
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(row);
    observer.observe(measure);
    void document.fonts?.ready.then(recompute);
    return () => observer.disconnect();
  }, [navCount, enabled]);

  return { rowRef, measureRef, fit };
}
