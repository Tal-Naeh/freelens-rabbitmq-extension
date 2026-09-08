import { describe, expect, it } from "vitest";
import {
  classifyService,
  credentialHintFromWorkload,
  discoverRabbitmq,
  labelSelectorOf,
  parseRabbitmqCluster,
  parseServiceTarget,
  versionFromImage,
  workloadMatchesSelector,
} from "./discovery";

import type { KubeObject, KubeReader } from "./kube-reader";

const operatorCr: KubeObject = {
  apiVersion: "rabbitmq.com/v1beta1",
  kind: "RabbitmqCluster",
  metadata: { name: "rabbit", namespace: "messaging" },
  spec: { replicas: 3, image: "rabbitmq:3.13.2-management" },
  status: {
    defaultUser: { secretReference: { name: "rabbit-default-user" } },
    conditions: [{ type: "AllReplicasReady", status: "True" }],
  },
};

const operatorSvc: KubeObject = {
  metadata: {
    name: "rabbit",
    namespace: "messaging",
    labels: { "app.kubernetes.io/name": "rabbit", "app.kubernetes.io/part-of": "rabbitmq" },
  },
  spec: {
    selector: { "app.kubernetes.io/name": "rabbit" },
    ports: [
      { name: "amqp", port: 5672, targetPort: 5672 },
      { name: "management", port: 15672, targetPort: 15672 },
    ],
  },
};

const bitnamiSvc: KubeObject = {
  metadata: {
    name: "myrel-rabbitmq",
    namespace: "apps",
    labels: {
      "app.kubernetes.io/name": "rabbitmq",
      "app.kubernetes.io/instance": "myrel",
      "helm.sh/chart": "rabbitmq-14.0.0",
    },
  },
  spec: {
    selector: { "app.kubernetes.io/name": "rabbitmq", "app.kubernetes.io/instance": "myrel" },
    ports: [
      { name: "amqp", port: 5672, targetPort: "amqp" },
      { name: "http-stats", port: 15672, targetPort: "stats" },
    ],
  },
};

const bitnamiHeadless: KubeObject = {
  ...bitnamiSvc,
  metadata: { ...bitnamiSvc.metadata, name: "myrel-rabbitmq-headless" },
  spec: { ...bitnamiSvc.spec, clusterIP: "None" },
};

const bitnamiSts: KubeObject = {
  kind: "StatefulSet",
  metadata: { name: "myrel-rabbitmq", namespace: "apps" },
  spec: {
    replicas: 1,
    template: {
      metadata: { labels: { "app.kubernetes.io/name": "rabbitmq", "app.kubernetes.io/instance": "myrel" } },
      spec: {
        containers: [
          {
            name: "rabbitmq",
            image: "bitnami/rabbitmq:3.12.10",
            env: [
              { name: "RABBITMQ_USERNAME", value: "admin" },
              {
                name: "RABBITMQ_PASSWORD",
                valueFrom: { secretKeyRef: { name: "myrel-rabbitmq", key: "rabbitmq-password" } },
              },
            ],
          },
        ],
      },
    },
  },
  status: { readyReplicas: 1 },
};

function fakeReader(objects: { crs?: KubeObject[]; services?: KubeObject[]; workloads?: KubeObject[] }): KubeReader {
  return {
    listCustomResources: async () => objects.crs ?? [],
    listServices: async () => objects.services ?? [],
    listWorkloads: async () => objects.workloads ?? [],
    listPods: async () => [],
    getSecret: async () => null,
  };
}

describe("versionFromImage", () => {
  it("extracts semver from common tags", () => {
    expect(versionFromImage("rabbitmq:3.13.2-management")).toBe("3.13.2");
    expect(versionFromImage("bitnami/rabbitmq:3.12.10-debian-11-r0")).toBe("3.12.10");
    expect(versionFromImage("registry/rabbitmq@sha256:abc")).toBeUndefined();
    expect(versionFromImage(undefined)).toBeUndefined();
  });
});

describe("parseRabbitmqCluster", () => {
  it("maps an operator CR to a target with the default-user secret hint", () => {
    const t = parseRabbitmqCluster(operatorCr, [operatorSvc]);
    expect(t).toMatchObject({
      name: "rabbit",
      namespace: "messaging",
      source: "operator",
      podSelector: "app.kubernetes.io/name=rabbit",
      serviceName: "rabbit",
      managementPort: "management",
      managementTls: false,
      amqpPort: 5672,
      version: "3.13.2",
      replicas: 3,
      credentialHint: {
        kind: "operator-default-user",
        secret: { namespace: "messaging", name: "rabbit-default-user" },
      },
    });
    expect(t?.conditions).toEqual([{ type: "AllReplicasReady", status: "True", reason: undefined }]);
  });

  it("switches to the TLS management listener only when non-TLS listeners are disabled", () => {
    const tlsCr = {
      ...operatorCr,
      spec: {
        ...operatorCr.spec,
        tls: { secretName: "rabbit-tls", caSecretName: "rabbit-ca", disableNonTLSListeners: true },
      },
    };
    const t = parseRabbitmqCluster(tlsCr, [])!;
    expect(t.managementTls).toBe(true);
    expect(t.managementPort).toBe("management-tls");
    expect(t.amqpPort).toBe(5671);
    expect(t.tlsCaSecret).toEqual({ namespace: "messaging", name: "rabbit-ca" });

    const mixed = parseRabbitmqCluster({ ...operatorCr, spec: { ...operatorCr.spec, tls: { secretName: "x" } } }, [])!;
    expect(mixed.managementTls).toBe(false);
    expect(mixed.amqpTls).toBe(true);
  });
});

describe("classifyService", () => {
  it("recognises management + amqp ports by number", () => {
    const c = classifyService(operatorSvc);
    expect(c?.managementPort.port).toBe(15672);
    expect(c?.amqpPort?.port).toBe(5672);
  });
  it("recognises Bitnami http-stats naming on a rabbit-labelled service", () => {
    expect(classifyService(bitnamiSvc)?.managementPort.name).toBe("http-stats");
  });
  it("ignores unrelated services", () => {
    expect(
      classifyService({ metadata: { name: "web" }, spec: { ports: [{ port: 80 }, { port: 443 }] } }),
    ).toBeUndefined();
    expect(
      classifyService({ metadata: { name: "grafana" }, spec: { ports: [{ name: "http", port: 3000 }] } }),
    ).toBeUndefined();
  });
});

describe("credential hints from workloads", () => {
  it("derives a secret hint from Bitnami env vars", () => {
    expect(credentialHintFromWorkload(bitnamiSts, "apps")).toEqual({
      kind: "secret",
      secret: { namespace: "apps", name: "myrel-rabbitmq" },
      passwordKey: "rabbitmq-password",
      usernameKey: undefined,
      username: "admin",
    });
  });
  it("uses the same-secret username key when both come from one Secret", () => {
    const w: KubeObject = {
      spec: {
        template: {
          spec: {
            containers: [
              {
                env: [
                  { name: "RABBITMQ_DEFAULT_USER", valueFrom: { secretKeyRef: { name: "creds", key: "user" } } },
                  { name: "RABBITMQ_DEFAULT_PASS", valueFrom: { secretKeyRef: { name: "creds", key: "pass" } } },
                ],
              },
            ],
          },
        },
      },
    };
    expect(credentialHintFromWorkload(w, "ns")).toEqual({
      kind: "secret",
      secret: { namespace: "ns", name: "creds" },
      passwordKey: "pass",
      usernameKey: "user",
      username: undefined,
    });
  });
  it("matches workloads by pod template labels", () => {
    expect(workloadMatchesSelector(bitnamiSts, bitnamiSvc.spec.selector)).toBe(true);
    expect(workloadMatchesSelector(bitnamiSts, { app: "other" })).toBe(false);
    expect(labelSelectorOf({ b: "2", a: "1" })).toBe("a=1,b=2");
  });
});

describe("parseServiceTarget", () => {
  it("builds a Bitnami target with named target port and workload facts", () => {
    const t = parseServiceTarget(classifyService(bitnamiSvc)!, [bitnamiSts])!;
    expect(t).toMatchObject({
      source: "service",
      provider: "Bitnami chart",
      podSelector: "app.kubernetes.io/instance=myrel,app.kubernetes.io/name=rabbitmq",
      managementPort: "stats",
      managementTls: false,
      amqpPort: 5672,
      version: "3.12.10",
      replicas: 1,
      readyReplicas: 1,
    });
    expect(t.credentialHint).toMatchObject({ kind: "secret", username: "admin" });
  });
});

describe("discoverRabbitmq", () => {
  it("folds operator services into the CR entry and collapses headless twins", async () => {
    const reader = fakeReader({
      crs: [operatorCr],
      services: [operatorSvc, bitnamiHeadless, bitnamiSvc],
      workloads: [bitnamiSts],
    });
    const targets = await discoverRabbitmq(reader);
    expect(targets.map((t) => `${t.source}:${t.namespace}/${t.name}`)).toEqual([
      "service:apps/myrel-rabbitmq",
      "operator:messaging/rabbit",
    ]);
    // Non-headless service preferred over the headless twin.
    expect(targets[0].serviceName).toBe("myrel-rabbitmq");
  });

  it("falls back to guest when nothing hints at credentials", async () => {
    const plain: KubeObject = {
      metadata: { name: "rabbitmq", namespace: "default" },
      spec: { selector: { app: "rabbitmq" }, ports: [{ port: 5672 }, { port: 15672 }] },
    };
    const [t] = await discoverRabbitmq(fakeReader({ services: [plain] }));
    expect(t.credentialHint).toEqual({ kind: "guess", username: "guest" });
    expect(t.provider).toBe("In-cluster Service");
  });
});
