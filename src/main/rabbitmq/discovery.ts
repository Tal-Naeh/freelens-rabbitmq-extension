import {
  RABBITMQ_AMQP_PORT,
  RABBITMQ_AMQPS_PORT,
  RABBITMQ_CLUSTER_CRD,
  RABBITMQ_MANAGEMENT_PORT,
  RABBITMQ_MANAGEMENT_TLS_PORT,
} from "../../common/constants";
import { createRabbitmqTargetId } from "../../common/target";

import type { CredentialHint, DiscoveredRabbitmqInfo } from "../../common/ipc";
import type { KubeObject, KubeReader } from "./kube-reader";

interface ServicePort {
  name?: string;
  port?: number;
  targetPort?: number | string;
  protocol?: string;
}

const MANAGEMENT_PORTS = new Set([RABBITMQ_MANAGEMENT_PORT, RABBITMQ_MANAGEMENT_TLS_PORT]);
const AMQP_PORTS = new Set([RABBITMQ_AMQP_PORT, RABBITMQ_AMQPS_PORT]);
const MANAGEMENT_NAME = /management|http-stats|^http$|^web$|^ui$|^mgmt$/i;
const AMQP_NAME = /amqp/i;

export function labelSelectorOf(selector: Record<string, string> | undefined): string {
  return Object.entries(selector ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
}

function serviceLooksLikeRabbitmq(svc: KubeObject): boolean {
  const name = svc.metadata?.name ?? "";
  const labels = svc.metadata?.labels ?? {};
  const haystack = [name, ...Object.values(labels), labels["app.kubernetes.io/name"] ?? ""].join(" ").toLowerCase();
  return haystack.includes("rabbit");
}

/** Extracts the image tag (`rabbitmq:3.13.2-management` → `3.13.2`). Pure. */
export function versionFromImage(image: string | undefined): string | undefined {
  if (!image) return undefined;
  const last = image.split("@")[0].split("/").pop() ?? "";
  const colon = last.indexOf(":");
  if (colon < 0) return undefined;
  const tag = last.slice(colon + 1);
  if (!tag) return undefined;
  const m = tag.match(/^v?(\d+\.\d+(?:\.\d+)?)/);
  return m ? m[1] : tag;
}

/** Parse a RabbitMQ Cluster Operator `RabbitmqCluster` CR into a discovered target. Pure. */
export function parseRabbitmqCluster(cr: KubeObject, services: KubeObject[]): DiscoveredRabbitmqInfo | undefined {
  const name = cr.metadata?.name;
  const namespace = cr.metadata?.namespace;
  if (!name || !namespace) return undefined;

  const tls = cr.spec?.tls ?? {};
  const tlsEnabled = Boolean(tls.secretName);
  const nonTlsDisabled = Boolean(tls.disableNonTLSListeners);
  const managementTls = tlsEnabled && nonTlsDisabled;

  // The operator's client Service is `<name>` (older releases: `<name>-client`).
  const service =
    services.find((s) => s.metadata?.namespace === namespace && s.metadata?.name === name) ??
    services.find((s) => s.metadata?.namespace === namespace && s.metadata?.name === `${name}-client`);

  const defaultUserSecret: string = cr.status?.defaultUser?.secretReference?.name ?? `${name}-default-user`;
  const conditions = ((cr.status?.conditions ?? []) as any[]).map((c) => ({
    type: String(c.type ?? ""),
    status: String(c.status ?? ""),
    reason: c.reason ? String(c.reason) : undefined,
  }));

  return {
    targetId: createRabbitmqTargetId(namespace, name, "operator"),
    name,
    namespace,
    source: "operator",
    provider: "RabbitMQ Cluster Operator",
    podSelector: `app.kubernetes.io/name=${name}`,
    serviceName: service?.metadata?.name,
    managementPort: managementTls ? "management-tls" : "management",
    managementTls,
    amqpPort: nonTlsDisabled ? RABBITMQ_AMQPS_PORT : RABBITMQ_AMQP_PORT,
    amqpTls: tlsEnabled,
    credentialHint: { kind: "operator-default-user", secret: { namespace, name: defaultUserSecret } },
    version: versionFromImage(cr.spec?.image),
    replicas: typeof cr.spec?.replicas === "number" ? cr.spec.replicas : undefined,
    readyReplicas: undefined,
    conditions,
    tlsCaSecret: tls.caSecretName ? { namespace, name: String(tls.caSecretName) } : undefined,
  };
}

export interface ServiceCandidate {
  service: KubeObject;
  managementPort: ServicePort;
  amqpPort?: ServicePort;
}

/** Find the Management + AMQP ports on a Service, if it looks like RabbitMQ. Pure. */
export function classifyService(svc: KubeObject): ServiceCandidate | undefined {
  const ports = (svc.spec?.ports ?? []) as ServicePort[];
  const management = ports.find(
    (p) =>
      (p.port !== undefined && MANAGEMENT_PORTS.has(p.port)) ||
      (typeof p.targetPort === "number" && MANAGEMENT_PORTS.has(p.targetPort)) ||
      (p.name !== undefined && MANAGEMENT_NAME.test(p.name) && serviceLooksLikeRabbitmq(svc)),
  );
  if (!management) return undefined;
  const amqp = ports.find(
    (p) =>
      (p.port !== undefined && AMQP_PORTS.has(p.port)) ||
      (typeof p.targetPort === "number" && AMQP_PORTS.has(p.targetPort)) ||
      (p.name !== undefined && AMQP_NAME.test(p.name)),
  );
  if (!amqp && !serviceLooksLikeRabbitmq(svc)) return undefined;
  return { service: svc, managementPort: management, amqpPort: amqp };
}

function isHeadless(svc: KubeObject): boolean {
  return svc.spec?.clusterIP === "None";
}

function providerOf(svc: KubeObject): string {
  const labels = svc.metadata?.labels ?? {};
  const chart = labels["helm.sh/chart"] ?? "";
  if (chart.startsWith("rabbitmq")) return "Bitnami chart";
  if (labels["app.kubernetes.io/managed-by"]?.toLowerCase() === "helm") return "Helm release";
  return "In-cluster Service";
}

interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: { secretKeyRef?: { name: string; key: string } };
}

const USER_ENV = ["RABBITMQ_DEFAULT_USER", "RABBITMQ_USERNAME", "RABBITMQ_USER"];
const PASS_ENV = ["RABBITMQ_DEFAULT_PASS", "RABBITMQ_PASSWORD", "RABBITMQ_PASS"];

/** Does this workload's pod template carry every label in the Service selector? Pure. */
export function workloadMatchesSelector(workload: KubeObject, selector: Record<string, string>): boolean {
  const labels: Record<string, string> = workload.spec?.template?.metadata?.labels ?? {};
  const entries = Object.entries(selector);
  return entries.length > 0 && entries.every(([k, v]) => labels[k] === v);
}

/**
 * Derive a credential hint from the RabbitMQ container's environment (official image:
 * `RABBITMQ_DEFAULT_USER/PASS`; Bitnami: `RABBITMQ_USERNAME/PASSWORD` from a Secret). Pure.
 */
export function credentialHintFromWorkload(workload: KubeObject, namespace: string): CredentialHint | undefined {
  const containers: any[] = workload.spec?.template?.spec?.containers ?? [];
  for (const container of containers) {
    const env: EnvVar[] = container.env ?? [];
    const user = env.find((e) => USER_ENV.includes(e.name));
    const pass = env.find((e) => PASS_ENV.includes(e.name));
    if (!pass) continue;
    const passRef = pass.valueFrom?.secretKeyRef;
    if (passRef) {
      const userRef = user?.valueFrom?.secretKeyRef;
      return {
        kind: "secret",
        secret: { namespace, name: passRef.name },
        passwordKey: passRef.key,
        usernameKey: userRef && userRef.name === passRef.name ? userRef.key : undefined,
        username: user?.value ?? (userRef ? undefined : "guest"),
      };
    }
    // Plain-text password in env is discouraged, but we can still use the username.
    if (user?.value) return { kind: "guess", username: user.value };
  }
  return undefined;
}

/** Bitnami convention: Secret `<release>-rabbitmq` with key `rabbitmq-password`, user from env. Pure. */
function bitnamiFallbackHint(svc: KubeObject): CredentialHint | undefined {
  const labels = svc.metadata?.labels ?? {};
  const release = labels["app.kubernetes.io/instance"];
  const namespace = svc.metadata?.namespace;
  if (!release || !namespace || !(labels["helm.sh/chart"] ?? "").startsWith("rabbitmq")) return undefined;
  return {
    kind: "secret",
    secret: { namespace, name: `${release}-rabbitmq` },
    passwordKey: "rabbitmq-password",
    username: "user",
  };
}

export function parseServiceTarget(
  candidate: ServiceCandidate,
  workloads: KubeObject[],
): DiscoveredRabbitmqInfo | undefined {
  const svc = candidate.service;
  const name = svc.metadata?.name;
  const namespace = svc.metadata?.namespace;
  const selector: Record<string, string> = svc.spec?.selector ?? {};
  if (!name || !namespace || Object.keys(selector).length === 0) return undefined;

  const mgmt = candidate.managementPort;
  const managementTls =
    mgmt.port === RABBITMQ_MANAGEMENT_TLS_PORT ||
    mgmt.targetPort === RABBITMQ_MANAGEMENT_TLS_PORT ||
    /tls|https/i.test(mgmt.name ?? "");
  const amqp = candidate.amqpPort;
  const amqpTls = amqp ? amqp.port === RABBITMQ_AMQPS_PORT || /amqps|tls/i.test(amqp.name ?? "") : false;

  const owner = workloads.find((w) => w.metadata?.namespace === namespace && workloadMatchesSelector(w, selector));
  const hint: CredentialHint = (owner && credentialHintFromWorkload(owner, namespace)) ??
    bitnamiFallbackHint(svc) ?? { kind: "guess", username: "guest" };

  const replicas: number | undefined = owner?.spec?.replicas;
  const readyReplicas: number | undefined = owner?.status?.readyReplicas;
  const image: string | undefined = owner?.spec?.template?.spec?.containers?.[0]?.image;

  return {
    targetId: createRabbitmqTargetId(namespace, name, "service"),
    name,
    namespace,
    source: "service",
    provider: providerOf(svc),
    podSelector: labelSelectorOf(selector),
    serviceName: name,
    managementPort:
      mgmt.targetPort ?? mgmt.port ?? (managementTls ? RABBITMQ_MANAGEMENT_TLS_PORT : RABBITMQ_MANAGEMENT_PORT),
    managementTls,
    amqpPort: typeof amqp?.port === "number" ? amqp.port : undefined,
    amqpTls,
    credentialHint: hint,
    version: versionFromImage(image),
    replicas: typeof replicas === "number" ? replicas : undefined,
    readyReplicas: typeof readyReplicas === "number" ? readyReplicas : undefined,
  };
}

/**
 * Discover RabbitMQ targets in the connected cluster:
 *  1. `RabbitmqCluster` CRs (RabbitMQ Cluster Operator);
 *  2. plain Services exposing the Management API (15672/15671) — Bitnami charts, hand-rolled StatefulSets.
 * Services that belong to an operator-managed cluster are folded into the CR entry.
 */
export async function discoverRabbitmq(reader: KubeReader, namespace?: string): Promise<DiscoveredRabbitmqInfo[]> {
  const [crs, services, workloads] = await Promise.all([
    reader.listCustomResources(RABBITMQ_CLUSTER_CRD, namespace),
    reader.listServices(namespace),
    reader.listWorkloads(namespace),
  ]);

  const results: DiscoveredRabbitmqInfo[] = [];
  const operatorNames = new Set<string>();
  for (const cr of crs) {
    const target = parseRabbitmqCluster(cr, services);
    if (!target) continue;
    operatorNames.add(`${target.namespace}/${target.name}`);
    results.push(target);
  }

  // Group service candidates by namespace+selector so headless/client twins collapse into one target.
  const bySelector = new Map<string, ServiceCandidate[]>();
  for (const svc of services) {
    const ns = svc.metadata?.namespace ?? "";
    const labels = svc.metadata?.labels ?? {};
    const operatorOwner = labels["app.kubernetes.io/name"];
    if (
      labels["app.kubernetes.io/part-of"] === "rabbitmq" &&
      operatorOwner &&
      operatorNames.has(`${ns}/${operatorOwner}`)
    ) {
      continue;
    }
    const candidate = classifyService(svc);
    if (!candidate) continue;
    const key = `${ns}|${labelSelectorOf(svc.spec?.selector)}`;
    const list = bySelector.get(key) ?? [];
    list.push(candidate);
    bySelector.set(key, list);
  }
  for (const candidates of bySelector.values()) {
    candidates.sort((a, b) => Number(isHeadless(a.service)) - Number(isHeadless(b.service)));
    const target = parseServiceTarget(candidates[0], workloads);
    if (target) results.push(target);
  }

  return results.sort((a, b) => `${a.namespace}/${a.name}`.localeCompare(`${b.namespace}/${b.name}`));
}
