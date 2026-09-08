import fs from "node:fs";
import { Main } from "@freelensapp/extensions";

import type { KubeReaderOptions } from "./rabbitmq/kube-reader";

interface KubernetesClusterEntityLike {
  metadata?: { uid?: string; name?: string };
  spec?: { kubeconfigPath?: string; kubeconfigContext?: string };
}

/** The id of the cluster the user is currently viewing (falls back to the first). */
export function activeClusterId(): string {
  const clusters = Main.Catalog.getAllClusters();
  const active = clusters.find((c) => c.isActive) ?? clusters[0];
  if (!active) throw new Error("no Kubernetes cluster is available");
  return active.id;
}

/**
 * Kubeconfig to use for a *raw* client-node connection (needed for the SPDY port-forward, which
 * Freelens's proxied `Main.K8s` does not expose).
 *
 * The catalog entity's `spec.kubeconfigPath` is the user's own kubeconfig file; `ClusterInfo`'s
 * `kubeConfigPath` is Freelens's proxy kubeconfig and cannot tunnel. Fall back to the default
 * kubeconfig + the cluster's context name when the entity is unavailable.
 */
export function resolveKubeconfigFor(clusterId?: string): KubeReaderOptions {
  const id = clusterId ?? activeClusterId();
  try {
    const entities = Main.Catalog.catalogEntities.getItemsForApiKind(
      "entity.k8slens.dev/v1alpha1",
      "KubernetesCluster",
    ) as unknown as KubernetesClusterEntityLike[];
    const entity = entities.find((e) => e.metadata?.uid === id);
    const path = entity?.spec?.kubeconfigPath;
    if (path && fs.existsSync(path)) {
      return { kubeConfigPath: path, context: entity?.spec?.kubeconfigContext };
    }
  } catch {
    // catalogEntities may be unavailable in older hosts; fall back below.
  }
  const cluster = Main.Catalog.getClusterById(id);
  return { context: cluster?.contextName };
}
