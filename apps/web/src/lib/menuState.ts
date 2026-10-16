/**
 * How many menus, dropdowns or popovers are open right now.
 *
 * Hover affordances read this so they don't fire for whatever sits underneath
 * an open menu — a dropdown covers the content it filters, so moving the
 * pointer down its options would otherwise light up tooltips behind it.
 */
let openCount = 0;

const listeners = new Set<(open: boolean) => void>();

export function anyMenuOpen() {
  return openCount > 0;
}

/** Call with `true` when a menu opens and `false` when it closes. */
export function setMenuOpen(open: boolean) {
  const was = openCount > 0;
  openCount = Math.max(0, openCount + (open ? 1 : -1));
  const now = openCount > 0;
  if (was !== now) listeners.forEach((fn) => fn(now));
}

export function subscribeMenuState(fn: (open: boolean) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
