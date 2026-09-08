import { RABBITMQ_MANAGEMENT_PORT, RABBITMQ_MANAGEMENT_TLS_PORT } from "../../common/constants";
import { RabbitmqError } from "../../common/errors";

import type { DiscoveredRabbitmqInfo } from "../../common/ipc";
import type { KubeObject, KubeReader } from "./kube-reader";
import type { PodPort } from "./port-forward";

export function isPodReady(pod: KubeObject): boolean {
  if (pod.status?.phase !== "Running") return false;
  const conditions: any[] = pod.status?.conditions ?? [];
  return conditions.some((c) => c.type === "Ready" && c.status === "True");
}

/** Resolve a named container port (`management`) to its number on a pod. Pure. */
export function resolveContainerPort(pod: KubeObject, port: number | string, tls: boolean): number {
  if (typeof port === "number") return port;
  const containers: any[] = pod.spec?.containers ?? [];
  for (const c of containers) {
    for (const p of c.ports ?? []) {
      if (p.name === port && typeof p.containerPort === "number") return p.containerPort;
    }
  }
  return tls ? RABBITMQ_MANAGEMENT_TLS_PORT : RABBITMQ_MANAGEMENT_PORT;
}

/** Pick a Ready broker pod and the numeric Management API port to forward to. */
export async function resolveManagementPod(reader: KubeReader, target: DiscoveredRabbitmqInfo): Promise<PodPort> {
  const pods = await reader.listPods(target.namespace, target.podSelector);
  const ready = pods.filter(isPodReady).sort((a, b) => (a.metadata?.name ?? "").localeCompare(b.metadata?.name ?? ""));
  const pod = ready[0] ?? pods.find((p) => p.status?.phase === "Running");
  if (!pod?.metadata?.name) {
    throw new RabbitmqError(
      "no-pod",
      `no running RabbitMQ pod matches "${target.podSelector}" in namespace ${target.namespace}`,
    );
  }
  return {
    namespace: target.namespace,
    pod: pod.metadata.name,
    port: resolveContainerPort(pod, target.managementPort, target.managementTls),
  };
}
