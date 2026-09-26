const SESSION_KEY = 'rs3.groupSession';

export type GroupSession = {
  name: string;
  token: string;
};

export function readGroupSession(): GroupSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GroupSession>;
    if (
      typeof parsed.name === 'string' &&
      parsed.name.trim() &&
      typeof parsed.token === 'string' &&
      parsed.token.trim()
    ) {
      return { name: parsed.name.trim(), token: parsed.token.trim() };
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

export function writeGroupSession(session: GroupSession) {
  localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      name: session.name.trim(),
      token: session.token.trim(),
    }),
  );
}

export function clearGroupSession() {
  localStorage.removeItem(SESSION_KEY);
}
