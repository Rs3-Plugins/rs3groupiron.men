import type { WireEntry } from './items';

export type GroupStreamEvent =
  | { type: 'snapshot'; at: string; data: WireEntry[] }
  | { type: 'delta'; at: string; data: WireEntry[] };

export type GroupStreamHandlers = {
  onEvent: (event: GroupStreamEvent) => void;
  /** Called once when the stream ends for any reason other than a clean stop. */
  onError: (err: Error) => void;
  /** Called after the first event arrives, so the caller can stop polling. */
  onOpen?: () => void;
};

/** Frames are separated by a blank line; \r\n is tolerated for proxy quirks. */
const FRAME_SEPARATOR = /\r?\n\r?\n/;

/**
 * Parses one SSE frame. Returns null for anything we do not care about —
 * heartbeats, comments, and unknown event types.
 */
export function parseFrame(raw: string): GroupStreamEvent | null {
  // Comment-only frames (": ping") are keepalives with no payload.
  if (!raw.trim() || raw.trimStart().startsWith(':')) return null;

  let event: string | undefined;
  const dataLines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (!dataLines.length) return null;

  let parsed: { type?: string; at?: string; data?: unknown };
  try {
    parsed = JSON.parse(dataLines.join('\n')) as typeof parsed;
  } catch {
    return null;
  }

  const type = event ?? parsed.type;
  if (type !== 'snapshot' && type !== 'delta') return null;
  if (!Array.isArray(parsed.data)) return null;

  return {
    type,
    at: parsed.at ?? new Date().toISOString(),
    data: parsed.data as WireEntry[],
  };
}

/**
 * Splits a growing buffer into complete frames, returning the leftover.
 * Exported so the framing can be tested without a live connection.
 */
export function drainFrames(buffer: string): {
  events: GroupStreamEvent[];
  rest: string;
} {
  const events: GroupStreamEvent[] = [];
  let rest = buffer;
  for (;;) {
    const match = FRAME_SEPARATOR.exec(rest);
    if (!match) break;
    const raw = rest.slice(0, match.index);
    rest = rest.slice(match.index + match[0].length);
    const parsed = parseFrame(raw);
    if (parsed) events.push(parsed);
  }
  return { events, rest };
}

/**
 * Vercel's `/api` rewrite buffers `text/event-stream`, so a same-origin stream
 * never delivers a byte and the client silently falls back to polling. This is
 * therefore the app's only cross-origin call, which is why the API's CORS list
 * and the site's `connect-src` both name it.
 *
 * Empty in dev, where Vite's proxy passes streams through unbuffered.
 */
const STREAM_ORIGIN = (import.meta.env.VITE_API_ORIGIN ?? '').replace(
  /\/+$/,
  '',
);

/**
 * Opens the group event stream, returning a function that closes it.
 *
 * `fetch` streaming rather than `EventSource`: the group token travels in the
 * Authorization header, which EventSource cannot set, and putting it in the
 * query string would leak it into proxy logs and browser history.
 */
export function openGroupStream(
  groupName: string,
  token: string,
  handlers: GroupStreamHandlers,
): () => void {
  const controller = new AbortController();
  let stopped = false;

  const stop = () => {
    stopped = true;
    controller.abort();
  };

  void (async () => {
    try {
      const res = await fetch(
        `${STREAM_ORIGIN}/api/group/${encodeURIComponent(groupName)}/events`,
        {
          headers: {
            Accept: 'text/event-stream',
            ...(token ? { Authorization: token } : {}),
          },
          signal: controller.signal,
        },
      );

      if (!res.ok) throw new Error(`stream failed (${res.status})`);
      if (!res.body) throw new Error('streaming not supported');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let opened = false;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = drainFrames(buffer);
        buffer = rest;
        for (const event of events) {
          if (!opened) {
            opened = true;
            handlers.onOpen?.();
          }
          handlers.onEvent(event);
        }
      }
      if (!stopped) throw new Error('stream closed');
    } catch (err) {
      // An abort is us closing the stream deliberately, not a failure.
      if (stopped) return;
      handlers.onError(
        err instanceof Error ? err : new Error('stream failed'),
      );
    }
  })();

  return stop;
}
