import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

/** Fetches `path` (re-fetching when path/query change) and exposes reload + local mutation. */
export function useApi(path, query) {
  const key = JSON.stringify([path, query ?? null]);
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    const id = ++latest.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    const [p, q] = JSON.parse(key);
    api(p, { query: q ?? undefined, signal: controller.signal })
      .then((data) => id === latest.current && setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error.name !== 'AbortError' && id === latest.current) setState((s) => ({ ...s, error, loading: false }));
      });
    return () => controller.abort();
  }, [key, tick, path]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater })), []);
  return { ...state, reload, setData };
}

export function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
