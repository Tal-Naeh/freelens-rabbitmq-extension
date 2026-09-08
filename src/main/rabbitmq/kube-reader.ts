import { AppsV1Api, CoreV1Api, CustomObjectsApi, KubeConfig } from "@kubernetes/client-node";

/** A loosely-typed Kubernetes object — enough for discovery/credential parsing and easy to fixture. */
export interface KubeObject {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    namespace?: string;
    uid?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    ownerReferences?: { kind?: string; name?: string }[];
  };
  spec?: any;
  status?: any;
}

export interface KubeSecret extends KubeObject {
  type?: string;
  /** base64-encoded values, as returned by the API. */
  data?: Record<string, string>;
}

/** Identifies a custom resource type: client-node needs the `plural`, Freelens's K8s API needs the `kind`. */
export interface CustomResourceRef {
  group: string;
  version: string;
  plural: string;
  kind: string;
}

/**
 * Read-only Kubernetes access needed by discovery, pod resolution and credential resolution.
 * A seam: production uses Freelens's connected cluster or client-node; unit tests inject a fake.
 */
export interface KubeReader {
  listCustomResources(ref: CustomResourceRef, namespace?: string): Promise<KubeObject[]>;
  listPods(namespace: string, labelSelector?: string): Promise<KubeObject[]>;
  listServices(namespace?: string): Promise<KubeObject[]>;
  /** Deployments + StatefulSets (each tagged with its `kind`), for env-based credential discovery. */
  listWorkloads(namespace?: string): Promise<KubeObject[]>;
  getSecret(namespace: string, name: string): Promise<KubeSecret | null>;
}

export interface KubeReaderOptions {
  kubeConfigPath?: string;
  context?: string;
}

function isNotFound(err: unknown): boolean {
  const code =
    (err as { code?: number; statusCode?: number } | null)?.code ?? (err as { statusCode?: number } | null)?.statusCode;
  return code === 404;
}

/** {@link KubeReader} backed by `@kubernetes/client-node` (same kubeconfig as the port-forward). */
export function createKubeReader(options: KubeReaderOptions = {}): KubeReader {
  const kc = new KubeConfig();
  if (options.kubeConfigPath) kc.loadFromFile(options.kubeConfigPath);
  else kc.loadFromDefault();
  if (options.context) kc.setCurrentContext(options.context);

  const core = kc.makeApiClient(CoreV1Api);
  const custom = kc.makeApiClient(CustomObjectsApi);
  const apps = kc.makeApiClient(AppsV1Api);

  return {
    async listCustomResources(ref, namespace) {
      const { group, version, plural } = ref;
      try {
        const res = namespace
          ? await custom.listNamespacedCustomObject({ group, version, namespace, plural })
          : await custom.listClusterCustomObject({ group, version, plural });
        return ((res as { items?: KubeObject[] }).items ?? []) as KubeObject[];
      } catch (err) {
        if (isNotFound(err)) return [];
        throw err;
      }
    },
    async listPods(namespace, labelSelector) {
      const res = await core.listNamespacedPod({ namespace, labelSelector });
      return (res.items ?? []) as unknown as KubeObject[];
    },
    async listServices(namespace) {
      const res = namespace
        ? await core.listNamespacedService({ namespace })
        : await core.listServiceForAllNamespaces();
      return (res.items ?? []) as unknown as KubeObject[];
    },
    async listWorkloads(namespace) {
      const [deployments, statefulSets] = await Promise.all([
        namespace ? apps.listNamespacedDeployment({ namespace }) : apps.listDeploymentForAllNamespaces(),
        namespace ? apps.listNamespacedStatefulSet({ namespace }) : apps.listStatefulSetForAllNamespaces(),
      ]);
      const tag = (items: unknown[] | undefined, kind: string): KubeObject[] =>
        ((items ?? []) as KubeObject[]).map((o) => ({ ...o, kind: o.kind ?? kind }));
      return [...tag(deployments.items, "Deployment"), ...tag(statefulSets.items, "StatefulSet")];
    },
    async getSecret(namespace, name) {
      try {
        const res = await core.readNamespacedSecret({ name, namespace });
        return res as unknown as KubeSecret;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
  };
}
