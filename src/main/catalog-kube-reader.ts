import { Main } from "@freelensapp/extensions";

import type { CustomResourceRef, KubeObject, KubeReader, KubeSecret } from "./rabbitmq/kube-reader";

/**
 * A {@link KubeReader} backed by Freelens's already-connected cluster via `Main.K8s`.
 * Reads go through Freelens's cluster connection, so no raw kubeconfig is loaded here.
 */
export function createCatalogKubeReader(clusterId: string): KubeReader {
  return {
    async listCustomResources(ref: CustomResourceRef, namespace) {
      // Querying a not-installed CR type errors generically, so list the CRDs first — a
      // cluster without the RabbitMQ operator then simply reads as "no operator clusters".
      const crdName = `${ref.plural}.${ref.group}`;
      const crds = await Main.K8s.queryCluster<KubeObject>(clusterId, {
        apiVersion: "apiextensions.k8s.io/v1",
        kind: "CustomResourceDefinition",
      });
      if (!crds.some((crd) => crd.metadata?.name === crdName)) return [];
      return Main.K8s.queryCluster<KubeObject>(clusterId, {
        apiVersion: `${ref.group}/${ref.version}`,
        kind: ref.kind,
        namespace,
      });
    },
    async listPods(namespace, labelSelector) {
      return Main.K8s.queryCluster<KubeObject>(clusterId, { apiVersion: "v1", kind: "Pod", namespace, labelSelector });
    },
    async listServices(namespace) {
      return Main.K8s.queryCluster<KubeObject>(clusterId, { apiVersion: "v1", kind: "Service", namespace });
    },
    async listWorkloads(namespace) {
      const lists = await Promise.all(
        ["Deployment", "StatefulSet"].map(async (kind) =>
          (await Main.K8s.queryCluster<KubeObject>(clusterId, { apiVersion: "apps/v1", kind, namespace })).map((o) => ({
            ...o,
            kind: o.kind ?? kind,
          })),
        ),
      );
      return lists.flat();
    },
    async getSecret(namespace, name) {
      return Main.K8s.getResource<KubeSecret>(clusterId, { apiVersion: "v1", kind: "Secret", namespace, name });
    },
  };
}
