/** Pure formatting helpers for the UI. */

export function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

export function formatRate(rate: number | undefined, unit = "/s"): string {
  if (rate === undefined || !Number.isFinite(rate)) return "—";
  const abs = Math.abs(rate);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${rate.toFixed(digits)}${unit}`;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatBytesRate(rate: number | undefined): string {
  if (rate === undefined || !Number.isFinite(rate)) return "—";
  return `${formatBytes(rate)}/s`;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatPercent(used: number | undefined, total: number | undefined): string {
  if (used === undefined || total === undefined || total <= 0) return "—";
  return `${Math.round((used / total) * 100)}%`;
}

export function formatTimestamp(epochMs: number | undefined): string {
  if (epochMs === undefined || !Number.isFinite(epochMs)) return "—";
  return new Date(epochMs).toLocaleString();
}

/** Pretty-print a JSON payload, returning the original text when it does not parse. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function shortNodeName(node: string | undefined): string {
  if (!node) return "—";
  return node.replace(/^rabbit@/, "");
}

/** Case-insensitive substring match over several fields. */
export function matchesQuery(query: string, ...fields: (string | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}
