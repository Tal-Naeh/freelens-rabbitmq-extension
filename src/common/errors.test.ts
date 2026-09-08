import { describe, expect, it } from "vitest";
import { parseIpcError, RabbitmqError, serializeIpcError } from "./errors";

describe("IPC error round-trip", () => {
  it("preserves code/status through Electron's message-only transport", () => {
    const wire = serializeIpcError(new RabbitmqError("unauthorized", "bad creds", 401));
    const wrapped = new Error(`Error invoking remote method 'x': ${wire.message}`);
    expect(parseIpcError(wrapped)).toEqual({ code: "unauthorized", message: "bad creds", status: 401 });
  });
  it("falls back to unknown for plain errors", () => {
    expect(parseIpcError(new Error("boom"))).toEqual({ code: "unknown", message: "boom" });
    expect(parseIpcError(serializeIpcError("str"))).toEqual({ code: "unknown", message: "str", status: undefined });
  });
});
