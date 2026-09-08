/**
 * End-to-end check of the Management API client against a real local broker
 * (`pnpm rabbitmq:up` first). Exercises: auth, overview/nodes, exchange+queue create via the
 * API, publish, list, peek with ack_requeue_true (proves nothing is consumed), purge, delete.
 *
 * Usage: RABBITMQ_URL=http://127.0.0.1:15672 RABBITMQ_USER=e2e RABBITMQ_PASS=e2e-password pnpm itest
 */
import assert from "node:assert/strict";
import { encodePathSegment } from "../../src/common/target";
import { createJsonHttpClient } from "../../src/main/rabbitmq/http";
import { RabbitmqManagementClient } from "../../src/main/rabbitmq/management-client";

const url = new URL(process.env.RABBITMQ_URL ?? "http://127.0.0.1:15672");
const username = process.env.RABBITMQ_USER ?? "e2e";
const password = process.env.RABBITMQ_PASS ?? "e2e-password";

const http = createJsonHttpClient({
  host: url.hostname,
  port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
  auth: { username, password },
  timeoutMs: 10_000,
});
const client = new RabbitmqManagementClient(http);
const vhost = "/";
const queue = `freelens-e2e-${Date.now()}`;
const exchange = `${queue}-ex`;
const q = `/api/queues/${encodePathSegment(vhost)}/${encodePathSegment(queue)}`;
const x = `/api/exchanges/${encodePathSegment(vhost)}/${encodePathSegment(exchange)}`;

async function step<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const result = await fn();
  console.log(`✓ ${label} (${Date.now() - started}ms)`);
  return result;
}

async function main() {
  const who = await step("whoami", () => client.whoami());
  assert.equal(who.name, username);

  const overview = await step("overview + nodes + vhosts", async () => {
    const [o, nodes, vhosts] = await Promise.all([client.overview(), client.nodes(), client.vhosts()]);
    assert.ok(o.rabbitmqVersion, "rabbitmq_version present");
    assert.ok(nodes.length >= 1, "at least one node");
    assert.ok(vhosts.includes("/"), "default vhost");
    return o;
  });
  console.log(
    `  RabbitMQ ${overview.rabbitmqVersion} (Erlang ${overview.erlangVersion}), cluster ${overview.clusterName}`,
  );

  await step("declare exchange + queue + binding (test fixture)", async () => {
    await http.request("PUT", x, { type: "direct", durable: true, auto_delete: false });
    await http.request("PUT", q, { durable: true, auto_delete: false, arguments: { "x-queue-type": "classic" } });
    await http.request(
      "POST",
      `/api/bindings/${encodePathSegment(vhost)}/e/${encodePathSegment(exchange)}/q/${encodePathSegment(queue)}`,
      {
        routing_key: "rk",
        arguments: {},
      },
    );
  });

  await step("publish 3 messages", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await client.publish(vhost, exchange, {
        routingKey: "rk",
        payload: JSON.stringify({ i, hello: "world" }),
        payloadEncoding: "string",
        properties: { content_type: "application/json", delivery_mode: 1 },
      });
      assert.equal(r.routed, true, "message routed");
    }
  });

  // Stats are eventually consistent; poll the queue until the count lands.
  const waitForMessages = async (expected: number) => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const d = await client.queueDetail(vhost, queue);
      if (d.queue.messages === expected) return d;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`queue never reached ${expected} messages`);
  };

  const before = await step("queue detail shows 3 messages + binding", async () => {
    const d = await waitForMessages(3);
    assert.equal(d.bindings.filter((b) => b.source === exchange).length, 1);
    return d;
  });

  await step("list queues/exchanges (paginated) include fixtures", async () => {
    const [qs, xs] = await Promise.all([client.listQueues(), client.listExchanges(vhost)]);
    assert.ok(qs.items.some((i) => i.name === queue));
    assert.ok(xs.items.some((i) => i.name === exchange));
    const ex = await client.exchangeDetail(vhost, exchange);
    assert.equal(ex.bindingsOut[0]?.destination, queue);
  });

  await step("peek 2 messages with ack_requeue_true — nothing consumed", async () => {
    const peek = await client.peekMessages(vhost, queue, 2);
    assert.equal(peek.ackMode, "ack_requeue_true");
    assert.equal(peek.messages.length, 2);
    assert.equal(peek.messages[0].contentKind, "json");
    assert.deepEqual(JSON.parse(peek.messages[0].payload), { i: 0, hello: "world" });
    const after = await waitForMessages(before.queue.messages);
    assert.equal(after.queue.messages, 3, "message count unchanged after peek");
    const again = await client.peekMessages(vhost, queue, 1);
    assert.equal(again.messages[0].redelivered, true, "peeked message is flagged redelivered");
  });

  await step("connections/channels/consumers endpoints respond", async () => {
    const [c, ch, co] = await Promise.all([client.listConnections(), client.listChannels(), client.listConsumers()]);
    assert.ok(Array.isArray(c.items) && Array.isArray(ch.items) && Array.isArray(co.items));
  });

  await step("purge empties the queue", async () => {
    await client.purgeQueue(vhost, queue);
    const d = await waitForMessages(0);
    assert.equal(d.queue.messages, 0);
  });

  await step("delete queue + exchange (cleanup)", async () => {
    await client.deleteQueue(vhost, queue);
    await client.deleteExchange(vhost, exchange);
    await assert.rejects(client.queueDetail(vhost, queue), (e: any) => e.code === "not-found");
  });

  await step("bad credentials map to 'unauthorized'", async () => {
    const bad = new RabbitmqManagementClient(
      createJsonHttpClient({
        host: url.hostname,
        port: Number(url.port || 80),
        auth: { username: "nope", password: "nope" },
        timeoutMs: 5_000,
      }),
    );
    await assert.rejects(bad.whoami(), (e: any) => e.code === "unauthorized");
  });

  console.log("\nAll e2e steps passed.");
}

main().catch((err) => {
  console.error("e2e FAILED:", err);
  process.exit(1);
});
