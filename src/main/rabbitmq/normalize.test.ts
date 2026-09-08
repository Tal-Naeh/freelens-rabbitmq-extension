import { describe, expect, it } from "vitest";
import {
  detectContentKind,
  rate,
  toChannel,
  toConnection,
  toConsumer,
  toNode,
  toPeekedMessage,
  toQueueSummary,
} from "./normalize";

describe("normalize", () => {
  it("extracts rates tolerant of disabled stats", () => {
    expect(rate(undefined, "publish")).toEqual({});
    expect(rate({ publish: 10, publish_details: { rate: 1.5 } }, "publish")).toEqual({ count: 10, rate: 1.5 });
    expect(rate({ publish: 10 }, "publish")).toEqual({ count: 10, rate: undefined });
  });

  it("maps a queue with quorum-era fields", () => {
    const q = toQueueSummary({
      name: "orders",
      vhost: "/",
      type: "quorum",
      state: "running",
      node: "rabbit@r-server-0",
      durable: true,
      messages: 5,
      messages_ready: 4,
      messages_unacknowledged: 1,
      consumers: 2,
      consumer_capacity: 0.5,
      memory: 1024,
      message_stats: { publish_details: { rate: 2 }, deliver_get_details: { rate: 1 } },
      arguments: { "x-queue-type": "quorum" },
    });
    expect(q).toMatchObject({
      name: "orders",
      type: "quorum",
      durable: true,
      autoDelete: false,
      messages: 5,
      ready: 4,
      unacknowledged: 1,
      consumers: 2,
      consumerUtilisation: 0.5,
      memory: 1024,
      publish: { count: undefined, rate: 2 },
      deliverGet: { count: undefined, rate: 1 },
      arguments: { "x-queue-type": "quorum" },
    });
  });

  it("maps nodes, connections, channels and consumers", () => {
    expect(
      toNode({
        name: "rabbit@a",
        running: true,
        mem_used: 1,
        mem_limit: 10,
        disk_free: 5,
        disk_free_limit: 1,
        partitions: [],
      }),
    ).toMatchObject({
      name: "rabbit@a",
      running: true,
      memAlarm: false,
      diskFreeAlarm: false,
      partitions: [],
    });
    expect(
      toConnection({
        name: "10.0.0.1:1234 -> 10.0.0.2:5672",
        user: "u",
        vhost: "/",
        protocol: "AMQP 0-9-1",
        channels: 2,
        ssl: false,
        client_properties: { connection_name: "svc-a", product: "Pika" },
      }),
    ).toMatchObject({ channels: 2, clientProperties: { connectionName: "svc-a", product: "Pika" } });
    expect(
      toChannel({
        name: "c (1)",
        number: 1,
        connection_details: { name: "c", peer_host: "h" },
        user: "u",
        vhost: "/",
        state: "running",
        prefetch_count: 10,
        consumer_count: 1,
      }),
    ).toMatchObject({
      number: 1,
      connectionName: "c",
      peerHost: "h",
      prefetchCount: 10,
      consumerCount: 1,
    });
    expect(
      toConsumer({
        consumer_tag: "ct",
        queue: { name: "q", vhost: "/" },
        channel_details: { name: "ch", connection_name: "cn", peer_host: "h", peer_port: 1 },
        ack_required: false,
        prefetch_count: 0,
      }),
    ).toMatchObject({
      consumerTag: "ct",
      queue: "q",
      channelName: "ch",
      ackRequired: false,
      prefetchCount: 0,
      active: true,
    });
  });

  it("classifies payload content", () => {
    expect(detectContentKind('{"a":1}', "string", undefined)).toBe("json");
    expect(detectContentKind("[1,2]", "string", undefined)).toBe("json");
    expect(detectContentKind("{not json", "string", undefined)).toBe("text");
    expect(detectContentKind("hello", "string", "application/json")).toBe("json");
    expect(detectContentKind("hello", "string", "text/plain")).toBe("text");
    expect(detectContentKind("AAAA", "base64", undefined)).toBe("binary");
  });

  it("maps peeked messages and flags truncation", () => {
    const m = toPeekedMessage(
      {
        payload: '{"x":1}',
        payload_encoding: "string",
        payload_bytes: 100,
        exchange: "ex",
        routing_key: "rk",
        redelivered: true,
        message_count: 3,
        properties: { content_type: "application/json", headers: { h: "v" } },
      },
      0,
      50,
    );
    expect(m).toMatchObject({
      index: 0,
      contentKind: "json",
      truncated: true,
      redelivered: true,
      messageCount: 3,
      exchange: "ex",
      routingKey: "rk",
    });
  });
});
