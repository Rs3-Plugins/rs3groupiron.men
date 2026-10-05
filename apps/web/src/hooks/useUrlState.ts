import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

type UrlStateOptions<T extends string> = {
  allowed?: readonly T[];
  history?: 'push' | 'replace';
  exclusive?: boolean;
};

export function useUrlState<T extends string = string>(
  key: string,
  fallback: NoInfer<T>,
  options: UrlStateOptions<T> = {},
): [T, (next: T) => void] {
  const { allowed, history = 'replace', exclusive = false } = options;
  const [params, setParams] = useSearchParams();

  const raw = params.get(key);
  const value =
    raw !== null && (!allowed || (allowed as readonly string[]).includes(raw))
      ? (raw as T)
      : (fallback as T);

  const set = useCallback(
    (next: T) => {
      setParams(
        (prev) => {
          const out = exclusive ? new URLSearchParams() : new URLSearchParams(prev);
          if (next === fallback) out.delete(key);
          else out.set(key, next);
          return out;
        },
        { replace: history === 'replace' },
      );
    },
    [key, fallback, history, exclusive, setParams],
  );

  return [value, set];
}

export function useUrlText(key: string, debounceMs = 300): [string, (next: string) => void] {
  const [urlValue, setUrlValue] = useUrlState(key, '');
  const [local, setLocal] = useState(urlValue);
  const timer = useRef<number | null>(null);
  const typing = useRef(false);

  useEffect(() => {
    if (!typing.current) setLocal(urlValue);
  }, [urlValue]);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  const set = useCallback(
    (next: string) => {
      setLocal(next);
      typing.current = true;
      if (timer.current != null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        typing.current = false;
        setUrlValue(next);
      }, debounceMs);
    },
    [debounceMs, setUrlValue],
  );

  return [local, set];
}

export function useUrlNumber(
  key: string,
  fallback: number,
  options: { min?: number; history?: 'push' | 'replace' } = {},
): [number, (next: number) => void] {
  const { min = Number.NEGATIVE_INFINITY, history = 'replace' } = options;
  const [raw, setRaw] = useUrlState(key, '', { history });

  const parsed = Number(raw);
  const value = raw !== '' && Number.isFinite(parsed) && parsed >= min ? parsed : fallback;

  const set = useCallback(
    (next: number) => setRaw(next === fallback ? '' : String(next)),
    [fallback, setRaw],
  );

  return [value, set];
}
