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

/**
 * Renderer-session store for UI selections (open drawer, active tab). Lives outside React so it
 * survives page re-mounts caused by route/URL changes, and outside the URL so a page param going
 * missing can never close a drawer.
 */
export class SelectionStore {
  private readonly values = new Map<string, string>();
  private readonly listeners = new Map<string, Set<(value: string) => void>>();

  get(key: string): string {
    return this.values.get(key) ?? "";
  }

  set(key: string, value: string): void {
    if (this.get(key) === value) return;
    if (value) this.values.set(key, value);
    else this.values.delete(key);
    for (const listener of this.listeners.get(key) ?? []) listener(value);
  }

  subscribe(key: string, listener: (value: string) => void): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }
}

export const selectionStore = new SelectionStore();

/**
 * A selection (open drawer, active tab) backed by {@link selectionStore}. The URL page param is
 * only READ, as a deep link: at mount, and whenever it changes to a new non-empty value (e.g. the
 * Exchanges page navigating to a queue). Opening never writes the URL — doing so re-renders the
 * route and can re-mount the page. Closing clears the URL param so a stale deep link is not re-applied.
 */
export function useSelectionParam(
  key: string,
  param: Renderer.Navigation.PageParam<string> | undefined,
  store: SelectionStore = selectionStore,
): [string, (v: string) => void] {
  const urlNow = param?.get() ?? "";
  const [value, setValue] = useState(() => urlNow || store.get(key));
  const lastUrl = useRef(urlNow);

  useEffect(() => {
    if (urlNow) store.set(key, urlNow);
    return store.subscribe(key, setValue);
  }, [store, key]);

  useEffect(() => {
    if (urlNow === lastUrl.current) return;
    lastUrl.current = urlNow;
    if (urlNow) store.set(key, urlNow);
  }, [store, key, urlNow]);

  const set = useCallback(
    (next: string) => {
      store.set(key, next);
      if (!next && param && param.get()) {
        lastUrl.current = "";
        param.set("", { replaceHistory: true });
      }
    },
    [store, key, param],
  );

  return [store.get(key) || value, set];
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
