import { describe, expect, it } from "vitest";
import { RabbitmqSessionManager, sessionKey } from "./session-manager";

import type { KubeReader } from "./kube-reader";

const noopReader: KubeReader = {
  listCustomResources: async () => [],
  listServices: async () => [],
  listWorkloads: async () => [],
  listPods: async () => [],
  getSecret: async () => null,
};

describe("RabbitmqSessionManager write-mode gate", () => {
  const mgr = new RabbitmqSessionManager({ createReader: () => noopReader, createForwarder: () => () => {} });

  it("is read-only by default and throws a typed error", () => {
    expect(mgr.isWriteMode("c", "t")).toBe(false);
    expect(() => mgr.assertWriteMode("c", "t", "Purging")).toThrowError(/Write Mode is off/);
    try {
      mgr.assertWriteMode("c", "t", "Purging");
    } catch (err) {
      expect(err).toMatchObject({ code: "write-mode-disabled" });
    }
  });

  it("arms and disarms per (cluster, target)", () => {
    mgr.setWriteMode("c", "t", true);
    expect(mgr.isWriteMode("c", "t")).toBe(true);
    expect(mgr.isWriteMode("other", "t")).toBe(false);
    expect(() => mgr.assertWriteMode("c", "t", "x")).not.toThrow();
    mgr.setWriteMode("c", "t", false);
    expect(mgr.isWriteMode("c", "t")).toBe(false);
  });

  it("closeAll resets write mode and manual credentials", () => {
    mgr.setWriteMode("c", "t", true);
    mgr.setManualCredentials("c", "t", "u", "p");
    expect(mgr.hasManualCredentials("c", "t")).toBe(true);
    mgr.closeAll();
    expect(mgr.isWriteMode("c", "t")).toBe(false);
    expect(mgr.hasManualCredentials("c", "t")).toBe(false);
  });

  it("builds stable session keys", () => {
    expect(sessionKey(undefined, "t")).toBe("active::t");
    expect(sessionKey("c", "t")).toBe("c::t");
  });
});
