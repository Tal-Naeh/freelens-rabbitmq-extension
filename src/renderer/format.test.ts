import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatRate, matchesQuery, prettyJson, shortNodeName } from "./format";

describe("format", () => {
  it("formats bytes and rates", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KiB");
    expect(formatBytes(undefined)).toBe("—");
    expect(formatRate(0.123)).toBe("0.12/s");
    expect(formatRate(123.4)).toBe("123/s");
  });
  it("formats durations", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(2 * 86_400_000 + 3_600_000)).toBe("2d 1h");
  });
  it("pretty-prints JSON and passes text through", () => {
    expect(prettyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
    expect(prettyJson("nope")).toBe("nope");
  });
  it("matches queries and shortens node names", () => {
    expect(matchesQuery("ord", "orders", undefined)).toBe(true);
    expect(matchesQuery("", undefined)).toBe(true);
    expect(matchesQuery("zzz", "orders")).toBe(false);
    expect(shortNodeName("rabbit@r-server-0")).toBe("r-server-0");
  });
});
