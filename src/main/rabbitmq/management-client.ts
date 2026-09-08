import {
  RABBITMQ_LIST_MAX_ITEMS,
  RABBITMQ_LIST_PAGE_SIZE,
  RABBITMQ_PEEK_MAX_COUNT,
  RABBITMQ_PEEK_TRUNCATE_BYTES,
} from "../../common/constants";
import { encodePathSegment } from "../../common/target";
import {
  rate,
  toBinding,
  toChannel,
  toConnection,
  toConsumer,
  toExchangeSummary,
  toNode,
  toPeekedMessage,
  toQueueSummary,
} from "./normalize";

import type {
  BindingDto,
  ChannelDto,
  ConnectionDto,
  ConsumerDto,
  ExchangeDetailDto,
  ExchangeSummaryDto,
  MessagesPeekDto,
  NodeDto,
  OverviewDto,
  PeekedMessageDto,
  PublishResultDto,
  QueueDetailDto,
  QueueSummaryDto,
} from "../../common/ipc";
import type { JsonHttpClient } from "./http";

type Raw = Record<string, any>;

interface Page<T> {
  items: T[];
  total_count?: number;
  page_count?: number;
}

export interface ListResult<T> {
  items: T[];
  totalCount: number;
  truncated: boolean;
}

export interface WhoAmI {
  name: string;
  tags: string[];
}

/** Typed facade over the RabbitMQ HTTP Management API. All list calls are bounded. */
export class RabbitmqManagementClient {
  constructor(private readonly http: JsonHttpClient) {}

  // -- identity / overview ----------------------------------------------------

  async whoami(): Promise<WhoAmI> {
    const raw = await this.http.request<Raw>("GET", "/api/whoami");
    const tags = Array.isArray(raw.tags)
      ? raw.tags.map(String)
      : String(raw.tags ?? "")
          .split(",")
          .filter(Boolean);
    return { name: String(raw.name ?? ""), tags };
  }

  async overview(): Promise<Omit<OverviewDto, "nodes" | "vhosts" | "userTags" | "session">> {
    const raw = await this.http.request<Raw>("GET", "/api/overview");
    const stats: Raw | undefined = raw.message_stats;
    const totals: Raw = raw.object_totals ?? {};
    const qt: Raw = raw.queue_totals ?? {};
    return {
      clusterName: String(raw.cluster_name ?? ""),
      rabbitmqVersion: String(raw.rabbitmq_version ?? ""),
      erlangVersion: String(raw.erlang_version ?? ""),
      managementVersion: raw.management_version ? String(raw.management_version) : undefined,
      node: String(raw.node ?? ""),
      totals: {
        queues: totals.queues ?? 0,
        exchanges: totals.exchanges ?? 0,
        connections: totals.connections ?? 0,
        channels: totals.channels ?? 0,
        consumers: totals.consumers ?? 0,
      },
      queueTotals: {
        messages: qt.messages ?? 0,
        ready: qt.messages_ready ?? 0,
        unacknowledged: qt.messages_unacknowledged ?? 0,
      },
      rates: {
        publish: rate(stats, "publish"),
        deliverGet: rate(stats, "deliver_get"),
        ack: rate(stats, "ack"),
        redeliver: rate(stats, "redeliver"),
        confirm: rate(stats, "confirm"),
        returnUnroutable: rate(stats, "return_unroutable"),
      },
    };
  }

  async nodes(): Promise<NodeDto[]> {
    const raw = await this.http.request<Raw[]>("GET", "/api/nodes");
    return (raw ?? []).map(toNode);
  }

  async vhosts(): Promise<string[]> {
    const raw = await this.http.request<Raw[]>("GET", "/api/vhosts?columns=name");
    return (raw ?? []).map((v) => String(v.name));
  }

  // -- queues -------------------------------------------------------------------

  listQueues(vhost?: string): Promise<ListResult<QueueSummaryDto>> {
    const base = vhost === undefined ? "/api/queues" : `/api/queues/${encodePathSegment(vhost)}`;
    return this.paginate(base, toQueueSummary);
  }

  async queueDetail(vhost: string, queue: string): Promise<QueueDetailDto> {
    const path = `/api/queues/${encodePathSegment(vhost)}/${encodePathSegment(queue)}`;
    const [raw, bindings] = await Promise.all([
      this.http.request<Raw>("GET", path),
      this.http.request<Raw[]>("GET", `${path}/bindings`),
    ]);
    return {
      queue: toQueueSummary(raw),
      bindings: (bindings ?? []).map(toBinding),
      consumers: ((raw.consumer_details ?? []) as Raw[]).map(toConsumer),
      headMessageTimestamp: raw.head_message_timestamp ? String(raw.head_message_timestamp) : undefined,
      messagesPersistent: typeof raw.messages_persistent === "number" ? raw.messages_persistent : undefined,
      messagesRam: typeof raw.messages_ram === "number" ? raw.messages_ram : undefined,
      garbageCollection: raw.garbage_collection,
      effectivePolicyDefinition: raw.effective_policy_definition,
    };
  }

  /**
   * Peek at messages WITHOUT consuming them: `ackmode: ack_requeue_true` makes the broker
   * re-queue every fetched message. Note this still counts as a delivery (redelivered flag set).
   */
  async peekMessages(vhost: string, queue: string, count: number): Promise<MessagesPeekDto> {
    const bounded = Math.max(1, Math.min(RABBITMQ_PEEK_MAX_COUNT, Math.floor(count)));
    const path = `/api/queues/${encodePathSegment(vhost)}/${encodePathSegment(queue)}/get`;
    const raw = await this.http.request<Raw[]>("POST", path, {
      count: bounded,
      ackmode: "ack_requeue_true",
      encoding: "auto",
      truncate: RABBITMQ_PEEK_TRUNCATE_BYTES,
    });
    const messages: PeekedMessageDto[] = (raw ?? []).map((m, i) => toPeekedMessage(m, i, RABBITMQ_PEEK_TRUNCATE_BYTES));
    return { vhost, queue, requested: bounded, ackMode: "ack_requeue_true", messages };
  }

  purgeQueue(vhost: string, queue: string): Promise<void> {
    return this.http.request<void>(
      "DELETE",
      `/api/queues/${encodePathSegment(vhost)}/${encodePathSegment(queue)}/contents`,
    );
  }

  deleteQueue(vhost: string, queue: string, opts: { ifEmpty?: boolean; ifUnused?: boolean } = {}): Promise<void> {
    const query = new URLSearchParams();
    if (opts.ifEmpty) query.set("if-empty", "true");
    if (opts.ifUnused) query.set("if-unused", "true");
    const qs = query.toString();
    return this.http.request<void>(
      "DELETE",
      `/api/queues/${encodePathSegment(vhost)}/${encodePathSegment(queue)}${qs ? `?${qs}` : ""}`,
    );
  }

  // -- exchanges ----------------------------------------------------------------

  listExchanges(vhost?: string): Promise<ListResult<ExchangeSummaryDto>> {
    const base = vhost === undefined ? "/api/exchanges" : `/api/exchanges/${encodePathSegment(vhost)}`;
    return this.paginate(base, toExchangeSummary);
  }

  async exchangeDetail(vhost: string, exchange: string): Promise<ExchangeDetailDto> {
    const path = `/api/exchanges/${encodePathSegment(vhost)}/${encodePathSegment(exchange)}`;
    const [raw, out, incoming] = await Promise.all([
      this.http.request<Raw>("GET", path),
      this.http.request<Raw[]>("GET", `${path}/bindings/source`),
      this.http.request<Raw[]>("GET", `${path}/bindings/destination`),
    ]);
    return {
      exchange: toExchangeSummary(raw),
      bindingsOut: (out ?? []).map(toBinding),
      bindingsIn: (incoming ?? []).map(toBinding),
    };
  }

  async publish(
    vhost: string,
    exchange: string,
    body: {
      routingKey: string;
      payload: string;
      payloadEncoding: "string" | "base64";
      properties?: Record<string, unknown>;
    },
  ): Promise<PublishResultDto> {
    const raw = await this.http.request<Raw>(
      "POST",
      `/api/exchanges/${encodePathSegment(vhost)}/${encodePathSegment(exchange)}/publish`,
      {
        properties: body.properties ?? {},
        routing_key: body.routingKey,
        payload: body.payload,
        payload_encoding: body.payloadEncoding,
      },
    );
    return { routed: Boolean(raw?.routed) };
  }

  deleteExchange(vhost: string, exchange: string, opts: { ifUnused?: boolean } = {}): Promise<void> {
    const qs = opts.ifUnused ? "?if-unused=true" : "";
    return this.http.request<void>(
      "DELETE",
      `/api/exchanges/${encodePathSegment(vhost)}/${encodePathSegment(exchange)}${qs}`,
    );
  }

  // -- connections / channels / consumers -----------------------------------------

  listConnections(): Promise<ListResult<ConnectionDto>> {
    return this.paginate("/api/connections", toConnection);
  }

  listChannels(): Promise<ListResult<ChannelDto>> {
    return this.paginate("/api/channels", toChannel);
  }

  async listConsumers(vhost?: string): Promise<ListResult<ConsumerDto>> {
    // /api/consumers does not paginate; bound it client-side.
    const path = vhost === undefined ? "/api/consumers" : `/api/consumers/${encodePathSegment(vhost)}`;
    const raw = (await this.http.request<Raw[]>("GET", path)) ?? [];
    const items = raw.slice(0, RABBITMQ_LIST_MAX_ITEMS).map(toConsumer);
    return { items, totalCount: raw.length, truncated: raw.length > items.length };
  }

  async bindingsForVhost(vhost: string): Promise<BindingDto[]> {
    const raw = await this.http.request<Raw[]>("GET", `/api/bindings/${encodePathSegment(vhost)}`);
    return (raw ?? []).map(toBinding);
  }

  // -- helpers --------------------------------------------------------------------

  private async paginate<T>(base: string, map: (raw: Raw) => T): Promise<ListResult<T>> {
    const items: T[] = [];
    let totalCount = 0;
    let page = 1;
    for (;;) {
      const sep = base.includes("?") ? "&" : "?";
      const res = await this.http.request<Page<Raw> | Raw[]>(
        "GET",
        `${base}${sep}page=${page}&page_size=${RABBITMQ_LIST_PAGE_SIZE}`,
      );
      // Very old brokers ignore pagination and return a bare array.
      if (Array.isArray(res)) {
        const mapped = res.slice(0, RABBITMQ_LIST_MAX_ITEMS).map(map);
        return { items: mapped, totalCount: res.length, truncated: res.length > mapped.length };
      }
      for (const raw of res.items ?? []) items.push(map(raw));
      totalCount = res.total_count ?? items.length;
      const pageCount = res.page_count ?? 1;
      if (page >= pageCount || items.length >= RABBITMQ_LIST_MAX_ITEMS) {
        return { items, totalCount, truncated: items.length < totalCount };
      }
      page += 1;
    }
  }
}
