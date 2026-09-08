import { KubeConfig, PortForward } from "@kubernetes/client-node";
import type { Duplex } from "node:stream";

import type { KubeReaderOptions } from "./kube-reader";
import type { Forwarder } from "./port-forward";

/**
 * Production {@link Forwarder} backed by the Kubernetes API (SPDY port-forward) via
 * `@kubernetes/client-node`. Loads the user's kubeconfig and selects the given context.
 */
export function createKubeForwarder(options: KubeReaderOptions = {}): Forwarder {
  const kc = new KubeConfig();
  if (options.kubeConfigPath) kc.loadFromFile(options.kubeConfigPath);
  else kc.loadFromDefault();
  if (options.context) kc.setCurrentContext(options.context);

  const portForward = new PortForward(kc);

  return (target, socket: Duplex) => {
    // output = socket (pod -> client), err = null, input = socket (client -> pod)
    portForward.portForward(target.namespace, target.pod, [target.port], socket, null, socket).catch((err: unknown) => {
      socket.destroy(err instanceof Error ? err : new Error(String(err)));
    });
  };
}
