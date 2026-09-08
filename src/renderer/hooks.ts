import { Renderer } from "@freelensapp/extensions";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseIpcError } from "../common/errors";

import type { RabbitmqIpcErrorShape } from "../common/ipc";

export interface ResourceState<T> {
  data?: T;
  error?: RabbitmqIpcErrorShape;
  loading: boolean;
  /** Timestamp of the last successful load. */
  loadedAt?: number;
  reload: () => void;
}

/**
 * Load an async resource keyed by `key`; re-runs when the key changes, optionally polls.
 * Stale responses (from a previous key) are discarded.
 */
export function useResource<T>(
  key: string | undefined,
  loader: () => Promise<T>,
  options: { refreshMs?: number; enabled?: boolean } = {},
): ResourceState<T> {
  const { refreshMs, enabled = true } = options;
  const [state, setState] = useState<Omit<ResourceState<T>, "reload">>({ loading: Boolean(key && enabled) });
  const [generation, setGeneration] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!key || !enabled) {
      setState({ loading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));
    loaderRef.current().then(
      (data) => {
        if (!cancelled) setState({ data, loading: false, loadedAt: Date.now() });
      },
      (err: unknown) => {
        if (!cancelled) setState((prev) => ({ data: prev.data, error: parseIpcError(err), loading: false }));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [key, enabled, generation]);

  useEffect(() => {
    if (!key || !enabled || !refreshMs) return;
    const timer = setInterval(() => setGeneration((g) => g + 1), refreshMs);
    return () => clearInterval(timer);
  }, [key, enabled, refreshMs]);

  const reload = useCallback(() => setGeneration((g) => g + 1), []);
  return { ...state, reload };
}

/** Two-way binding to a Freelens page URL param, with a local fallback when no param exists. */
export function usePageParam(param: Renderer.Navigation.PageParam<string> | undefined): [string, (v: string) => void] {
  const [local, setLocal] = useState(() => param?.get() ?? "");
  useEffect(() => {
    if (param) setLocal(param.get() ?? "");
  }, [param]);
  const set = useCallback(
    (value: string) => {
      setLocal(value);
      param?.set(value, { replaceHistory: true });
    },
    [param],
  );
  return [param ? (param.get() ?? "") : local, set];
}

/** Debounce a fast-changing value (search boxes). */
export function useDebounced<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
