import net from "node:net";
import { describe, expect, it } from "vitest";
import { openTunnel } from "./port-forward";

import type { Forwarder } from "./port-forward";

describe("openTunnel", () => {
  it("pipes accepted sockets through the forwarder and closes cleanly", async () => {
    // Fake "pod": a local echo server standing in for the SPDY stream.
    const echo = net.createServer((s) => s.pipe(s));
    await new Promise<void>((r) => echo.listen(0, "127.0.0.1", () => r()));
    const echoPort = (echo.address() as net.AddressInfo).port;

    const forwarder: Forwarder = (target, socket) => {
      const upstream = net.connect(echoPort, "127.0.0.1");
      socket.pipe(upstream).pipe(socket);
      expect(target).toEqual({ namespace: "ns", pod: "p", port: 15672 });
    };

    const tunnel = await openTunnel(forwarder, { namespace: "ns", pod: "p", port: 15672 });
    expect(tunnel.localHost).toBe("127.0.0.1");
    expect(tunnel.localPort).toBeGreaterThan(0);

    const reply = await new Promise<string>((resolve, reject) => {
      const c = net.connect(tunnel.localPort, tunnel.localHost, () => c.write("ping"));
      c.once("data", (d) => {
        resolve(d.toString());
        c.end();
      });
      c.once("error", reject);
    });
    expect(reply).toBe("ping");

    tunnel.close();
    await new Promise<void>((resolve) => {
      const c = net.connect(tunnel.localPort, tunnel.localHost);
      c.once("error", () => resolve());
      c.once("connect", () => {
        c.destroy();
        resolve();
      });
    });
    echo.close();
  });
});
