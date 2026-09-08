import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CSSProperties } from "react";

export const COLUMN_WIDTHS_KEY = "freelens-rabbitmq.column-widths.v1";

export interface ColumnSpec {
  id: string;
  /** Default width in px (also the flex-basis of the growing column). */
  width: number;
  /** One column per table may absorb leftover space until the user resizes it. */
  grow?: boolean;
  minWidth?: number;
  /** Right-align numbers. */
  numeric?: boolean;
}

export type ColumnWidths = Record<string, number>;
type AllWidths = Record<string, ColumnWidths>;

interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadWidths(storage: Storage | undefined, tableId: string): ColumnWidths {
  try {
    const raw = storage?.getItem(COLUMN_WIDTHS_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as AllWidths;
    const table = all?.[tableId];
    if (!table || typeof table !== "object") return {};
    return Object.fromEntries(Object.entries(table).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));
  } catch {
    return {};
  }
}

export function saveWidths(storage: Storage | undefined, tableId: string, widths: ColumnWidths): void {
  try {
    const raw = storage?.getItem(COLUMN_WIDTHS_KEY);
    const all = (raw ? (JSON.parse(raw) as AllWidths) : {}) ?? {};
    if (Object.keys(widths).length === 0) delete all[tableId];
    else all[tableId] = widths;
    storage?.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(all));
  } catch {
    // best effort
  }
}

/** Compute the inline style for a column given its spec and any user override. Pure. */
export function columnStyle(spec: ColumnSpec, override: number | undefined): CSSProperties {
  const min = spec.minWidth ?? 48;
  if (override !== undefined) {
    const w = Math.max(min, Math.round(override));
    return { flex: `0 0 ${w}px`, width: w, minWidth: min };
  }
  return spec.grow
    ? { flex: `1 1 ${spec.width}px`, minWidth: Math.max(min, Math.min(spec.width, 120)) }
    : { flex: `0 0 ${spec.width}px`, width: spec.width, minWidth: min };
}

export interface ResizableColumns {
  /** Props for the `<TableHead>` cell of a column (adds the drag handle). */
  head(
    id: string,
    className?: string,
  ): {
    id: string;
    className: string;
    style: CSSProperties;
    resizable: boolean;
    onResizeStart: (event: MouseEvent) => void;
    onResizeReset: () => void;
  };
  /** Props for a `<TableRow>` cell of the same column (width only). */
  cell(id: string, className?: string): { className: string; style: CSSProperties };
  resetAll(): void;
  hasOverrides: boolean;
}

/**
 * User-resizable, persisted column widths for a Freelens `Table`. Mirrors the behaviour of the
 * core list layout: drag the handle at a header cell's right edge, double-click it to reset.
 */
export function useResizableColumns(
  tableId: string,
  specs: readonly ColumnSpec[],
  storage: Storage | undefined = defaultStorage(),
): ResizableColumns {
  const [widths, setWidths] = useState<ColumnWidths>(() => loadWidths(storage, tableId));
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const byId = useMemo(() => new Map(specs.map((s) => [s.id, s])), [specs]);
  const drag = useRef<{ id: string; startX: number; startWidth: number; min: number } | null>(null);

  useEffect(() => {
    setWidths(loadWidths(storage, tableId));
  }, [storage, tableId]);

  const persist = useCallback(
    (next: ColumnWidths) => {
      widthsRef.current = next;
      setWidths(next);
      saveWidths(storage, tableId, next);
    },
    [storage, tableId],
  );

  const onMove = useCallback((event: MouseEvent) => {
    const d = drag.current;
    if (!d) return;
    const w = Math.max(d.min, d.startWidth + (event.clientX - d.startX));
    setWidths({ ...widthsRef.current, [d.id]: w });
  }, []);

  const onUp = useCallback(
    (event: MouseEvent) => {
      const d = drag.current;
      drag.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (!d) return;
      const w = Math.max(d.min, d.startWidth + (event.clientX - d.startX));
      persist({ ...widthsRef.current, [d.id]: Math.round(w) });
    },
    [onMove, persist],
  );

  useEffect(
    () => () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    },
    [onMove, onUp],
  );

  const start = useCallback(
    (id: string, event: MouseEvent) => {
      const spec = byId.get(id);
      const handle = event.target as HTMLElement | null;
      const cellEl = handle?.closest?.(".TableCell") as HTMLElement | null;
      const startWidth = cellEl?.getBoundingClientRect().width ?? widthsRef.current[id] ?? spec?.width ?? 120;
      drag.current = { id, startX: event.clientX, startWidth, min: spec?.minWidth ?? 48 };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [byId, onMove, onUp],
  );

  const reset = useCallback(
    (id: string) => {
      const { [id]: _drop, ...rest } = widthsRef.current;
      persist(rest);
    },
    [persist],
  );

  return useMemo<ResizableColumns>(
    () => ({
      head(id, className) {
        const spec = byId.get(id) ?? { id, width: 120 };
        return {
          id: `${tableId}:${id}`,
          className: [className, spec.numeric ? "RmqNum" : ""].filter(Boolean).join(" "),
          style: columnStyle(spec, widths[id]),
          resizable: true,
          onResizeStart: (event: MouseEvent) => start(id, event),
          onResizeReset: () => reset(id),
        };
      },
      cell(id, className) {
        const spec = byId.get(id) ?? { id, width: 120 };
        return {
          className: [className, spec.numeric ? "RmqNum" : ""].filter(Boolean).join(" "),
          style: columnStyle(spec, widths[id]),
        };
      },
      resetAll: () => persist({}),
      hasOverrides: Object.keys(widths).length > 0,
    }),
    [byId, tableId, widths, start, reset, persist],
  );
}
