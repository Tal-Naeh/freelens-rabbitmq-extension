import { describe, expect, it } from "vitest";
import { isPodReady, resolveContainerPort, resolveManagementPod } from "./pod-resolver";

import type { DiscoveredRabbitmqInfo } from "../../common/ipc";
import type { KubeObject, KubeReader } from "./kube-reader";

const target: DiscoveredRabbitmqInfo = {
  targetId: "t",
  name: "r",
  namespace: "ns",
  source: "operator",
  provider: "x",
  podSelector: "app.kubernetes.io/name=r",
  managementPort: "management",
  managementTls: false,
  amqpTls: false,
  credentialHint: { kind: "none" },
};

const pod = (name: string, ready: boolean, phase = "Running"): KubeObject => ({
  metadata: { name, namespace: "ns" },
  spec: {
    containers: [
      {
        name: "rabbitmq",
        ports: [
          { name: "amqp", containerPort: 5672 },
          { name: "management", containerPort: 15672 },
        ],
      },
    ],
  },
  status: { phase, conditions: [{ type: "Ready", status: ready ? "True" : "False" }] },
});

function readerWith(pods: KubeObject[]): KubeReader {
  return {
    listCustomResources: async () => [],
    listServices: async () => [],
    listWorkloads: async () => [],
    listPods: async () => pods,
    getSecret: async () => null,
  };
}

describe("pod resolver", () => {
  it("detects readiness", () => {
    expect(isPodReady(pod("a", true))).toBe(true);
    expect(isPodReady(pod("a", false))).toBe(false);
    expect(isPodReady(pod("a", true, "Pending"))).toBe(false);
  });

  it("resolves named ports against the pod and falls back to defaults", () => {
    expect(resolveContainerPort(pod("a", true), "management", false)).toBe(15672);
    expect(resolveContainerPort(pod("a", true), 15671, true)).toBe(15671);
    expect(resolveContainerPort(pod("a", true), "missing", true)).toBe(15671);
    expect(resolveContainerPort(pod("a", true), "missing", false)).toBe(15672);
  });

  it("prefers the first Ready pod by name", async () => {
    const r = await resolveManagementPod(
      readerWith([pod("r-server-2", true), pod("r-server-0", false), pod("r-server-1", true)]),
      target,
    );
    expect(r).toEqual({ namespace: "ns", pod: "r-server-1", port: 15672 });
  });

  it("throws no-pod when nothing is running", async () => {
    await expect(resolveManagementPod(readerWith([pod("a", false, "Pending")]), target)).rejects.toMatchObject({
      code: "no-pod",
    });
  });
});
