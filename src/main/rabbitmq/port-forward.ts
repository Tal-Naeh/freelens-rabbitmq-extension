import net from "node:net";
import type { Duplex } from "node:stream";

export interface PodPort {
  namespace: string;
  pod: string;
  port: number;
}

/**
 * Wires an accepted local socket to a pod port. In production this is the Kubernetes SPDY
 * port-forward (see `createKubeForwarder`); in tests it can be a plain TCP pipe.
 */
export type Forwarder = (target: PodPort, socket: Duplex) => void;

export interface Tunnel {
  readonly localHost: string;
  readonly localPort: number;
  readonly target: PodPort;
  close(): void;
}

/**
 * Opens one local TCP listener and tunnels every accepted connection to `target` through the
 * injected forwarder. Each HTTP request to the Management API rides its own forwarded stream.
 */
export function openTunnel(forwarder: Forwarder, target: PodPort, host = "127.0.0.1"): Promise<Tunnel> {
  return new Promise<Tunnel>((resolve, reject) => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on("error", () => socket.destroy());
      socket.on("close", () => sockets.delete(socket));
      forwarder(target, socket);
    });
    server.once("error", reject);
    server.listen(0, host, () => {
      const addr = server.address();
      if (!addr || typeof addr !== "object") {
        server.close();
        reject(new Error("failed to allocate a local port for port-forward"));
        return;
      }
      resolve({
        localHost: host,
        localPort: addr.port,
        target,
        close() {
          for (const socket of sockets) socket.destroy();
          sockets.clear();
          server.close();
        },
      });
    });
  });
}
