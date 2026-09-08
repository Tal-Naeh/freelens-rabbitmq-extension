import { describe, expect, it } from "vitest";
import { columnStyle, loadWidths, saveWidths } from "./resizable-columns";

function memStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("resizable columns", () => {
  it("styles growing, fixed and overridden columns", () => {
    expect(columnStyle({ id: "a", width: 200, grow: true }, undefined)).toEqual({ flex: "1 1 200px", minWidth: 120 });
    expect(columnStyle({ id: "b", width: 90 }, undefined)).toEqual({ flex: "0 0 90px", width: 90, minWidth: 48 });
    expect(columnStyle({ id: "b", width: 90, minWidth: 60 }, 20)).toEqual({
      flex: "0 0 60px",
      width: 60,
      minWidth: 60,
    });
    expect(columnStyle({ id: "a", width: 200, grow: true }, 333.4)).toEqual({
      flex: "0 0 333px",
      width: 333,
      minWidth: 48,
    });
  });

  it("persists per table and drops empty tables", () => {
    const s = memStorage();
    saveWidths(s, "t1", { a: 100 });
    saveWidths(s, "t2", { b: 50 });
    expect(loadWidths(s, "t1")).toEqual({ a: 100 });
    expect(loadWidths(s, "t2")).toEqual({ b: 50 });
    saveWidths(s, "t1", {});
    expect(loadWidths(s, "t1")).toEqual({});
    expect(loadWidths(s, "t2")).toEqual({ b: 50 });
    expect(loadWidths(undefined, "t1")).toEqual({});
  });

  it("ignores corrupt storage", () => {
    const s = memStorage();
    s.setItem("freelens-rabbitmq.column-widths.v1", "{nope");
    expect(loadWidths(s, "t")).toEqual({});
  });
});
