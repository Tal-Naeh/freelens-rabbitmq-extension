import { describe, expect, it } from "vitest";
import { RabbitmqManagementClient } from "./management-client";

import type { HttpMethod, JsonHttpClient } from "./http";

interface Call {
  method: HttpMethod;
  path: string;
  body?: unknown;
}

function fakeHttp(routes: Record<string, unknown | ((call: Call) => unknown)>): {
  http: JsonHttpClient;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    http: {
      async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
        const call = { method, path, body };
        calls.push(call);
        const key = `${method} ${path}`;
        const bare = `${method} ${path.split("?")[0]}`;
        if (!(key in routes) && !(bare in routes)) throw new Error(`unexpected ${key}`);
        const handler = key in routes ? routes[key] : routes[bare];
        return (typeof handler === "function" ? (handler as (c: Call) => unknown)(call) : handler) as T;
      },
    },
  };
}

describe("RabbitmqManagementClient", () => {
  it("peeks with ack_requeue_true and bounds the count", async () => {
    const { http, calls } = fakeHttp({
      "POST /api/queues/%2F/orders/get": [{ payload: "hi", payload_encoding: "string" }],
    });
    const client = new RabbitmqManagementClient(http);
    const res = await client.peekMessages("/", "orders", 999);
    expect(calls[0].body).toMatchObject({ ackmode: "ack_requeue_true", count: 50, encoding: "auto" });
    expect(res.ackMode).toBe("ack_requeue_true");
    expect(res.requested).toBe(50);
    expect(res.messages[0]).toMatchObject({ payload: "hi", contentKind: "text" });
  });

  it("URL-encodes vhosts and names in every path", async () => {
    const { http, calls } = fakeHttp({
      "GET /api/queues/my%2Fvhost/a%20b": { name: "a b", vhost: "my/vhost" },
      "GET /api/queues/my%2Fvhost/a%20b/bindings": [],
      "DELETE /api/queues/my%2Fvhost/a%20b/contents": undefined,
      "DELETE /api/exchanges/my%2Fvhost/ex": undefined,
    });
    const client = new RabbitmqManagementClient(http);
    await client.queueDetail("my/vhost", "a b");
    await client.purgeQueue("my/vhost", "a b");
    await client.deleteExchange("my/vhost", "ex", { ifUnused: true });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/queues/my%2Fvhost/a%20b",
      "GET /api/queues/my%2Fvhost/a%20b/bindings",
      "DELETE /api/queues/my%2Fvhost/a%20b/contents",
      "DELETE /api/exchanges/my%2Fvhost/ex?if-unused=true",
    ]);
  });

  it("walks paginated lists and reports truncation", async () => {
    const page = (n: number) => ({
      items: Array.from({ length: 2 }, (_, i) => ({ name: `q${n}-${i}`, vhost: "/" })),
      page: n,
      page_count: 2,
      total_count: 4,
    });
    const { http, calls } = fakeHttp({
      "GET /api/queues": (c: Call) => page(Number(new URL(`http://x${c.path}`).searchParams.get("page"))),
    });
    const res = await new RabbitmqManagementClient(http).listQueues();
    expect(calls.length).toBe(2);
    expect(res.items.map((q) => q.name)).toEqual(["q1-0", "q1-1", "q2-0", "q2-1"]);
    expect(res.totalCount).toBe(4);
    expect(res.truncated).toBe(false);
  });

  it("accepts bare arrays from brokers that ignore pagination", async () => {
    const { http } = fakeHttp({ "GET /api/exchanges": [{ name: "amq.direct", type: "direct" }] });
    const res = await new RabbitmqManagementClient(http).listExchanges();
    expect(res.items[0].name).toBe("amq.direct");
    expect(res.totalCount).toBe(1);
  });

  it("publishes with the Management API body shape", async () => {
    const { http, calls } = fakeHttp({ "POST /api/exchanges/%2F/ex/publish": { routed: true } });
    const res = await new RabbitmqManagementClient(http).publish("/", "ex", {
      routingKey: "rk",
      payload: "p",
      payloadEncoding: "string",
      properties: { delivery_mode: 2 },
    });
    expect(res.routed).toBe(true);
    expect(calls[0].body).toEqual({
      properties: { delivery_mode: 2 },
      routing_key: "rk",
      payload: "p",
      payload_encoding: "string",
    });
  });

  it("normalises whoami tags from string or array", async () => {
    const arr = new RabbitmqManagementClient(
      fakeHttp({ "GET /api/whoami": { name: "u", tags: ["administrator"] } }).http,
    );
    const str = new RabbitmqManagementClient(
      fakeHttp({ "GET /api/whoami": { name: "u", tags: "administrator,monitoring" } }).http,
    );
    expect((await arr.whoami()).tags).toEqual(["administrator"]);
    expect((await str.whoami()).tags).toEqual(["administrator", "monitoring"]);
  });
});
