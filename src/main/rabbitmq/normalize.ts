/**
 * Pure mappers from raw Management API objects to the IPC DTOs.
 * Tolerant of missing fields (stats can be disabled with `management.disable_stats`).
 */
import type {
  BindingDto,
  ChannelDto,
  ConnectionDto,
  ConsumerDto,
  ExchangeSummaryDto,
  NodeDto,
  PeekedMessageDto,
  QueueSummaryDto,
  RateDto,
} from "../../common/ipc";

type Raw = Record<string, any>;

export function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function rate(stats: Raw | undefined, key: string): RateDto {
  if (!stats) return {};
  return { count: num(stats[key]), rate: num(stats[`${key}_details`]?.rate) };
}

export function toNode(raw: Raw): NodeDto {
  return {
    name: String(raw.name ?? ""),
    type: String(raw.type ?? "disc"),
    running: raw.running !== false,
    uptimeMs: num(raw.uptime),
    memUsed: num(raw.mem_used),
    memLimit: num(raw.mem_limit),
    memAlarm: Boolean(raw.mem_alarm),
    diskFree: num(raw.disk_free),
    diskFreeLimit: num(raw.disk_free_limit),
    diskFreeAlarm: Boolean(raw.disk_free_alarm),
    fdUsed: num(raw.fd_used),
    fdTotal: num(raw.fd_total),
    socketsUsed: num(raw.sockets_used),
    socketsTotal: num(raw.sockets_total),
    procUsed: num(raw.proc_used),
    procTotal: num(raw.proc_total),
    partitions: Array.isArray(raw.partitions) ? raw.partitions.map(String) : [],
  };
}

export function toQueueSummary(raw: Raw): QueueSummaryDto {
  const stats: Raw | undefined = raw.message_stats;
  return {
    name: String(raw.name ?? ""),
    vhost: String(raw.vhost ?? "/"),
    type: String(raw.type ?? "classic"),
    state: String(raw.state ?? "unknown"),
    node: raw.node ? String(raw.node) : undefined,
    durable: Boolean(raw.durable),
    autoDelete: Boolean(raw.auto_delete),
    exclusive: Boolean(raw.exclusive),
    policy: raw.policy ? String(raw.policy) : undefined,
    messages: num(raw.messages) ?? 0,
    ready: num(raw.messages_ready) ?? 0,
    unacknowledged: num(raw.messages_unacknowledged) ?? 0,
    consumers: num(raw.consumers) ?? 0,
    consumerUtilisation: num(raw.consumer_capacity) ?? num(raw.consumer_utilisation),
    memory: num(raw.memory),
    messageBytes: num(raw.message_bytes),
    messageBytesPersistent: num(raw.message_bytes_persistent),
    publish: rate(stats, "publish"),
    deliverGet: rate(stats, "deliver_get"),
    ack: rate(stats, "ack"),
    redeliver: rate(stats, "redeliver"),
    idleSince: raw.idle_since ? String(raw.idle_since) : undefined,
    arguments: typeof raw.arguments === "object" && raw.arguments ? raw.arguments : {},
  };
}

export function toBinding(raw: Raw): BindingDto {
  return {
    source: String(raw.source ?? ""),
    destination: String(raw.destination ?? ""),
    destinationType: raw.destination_type === "exchange" ? "exchange" : "queue",
    routingKey: String(raw.routing_key ?? ""),
    vhost: String(raw.vhost ?? "/"),
    arguments: typeof raw.arguments === "object" && raw.arguments ? raw.arguments : {},
    propertiesKey: raw.properties_key ? String(raw.properties_key) : undefined,
  };
}

export function toConsumer(raw: Raw): ConsumerDto {
  const channel: Raw = raw.channel_details ?? {};
  return {
    consumerTag: String(raw.consumer_tag ?? ""),
    queue: String(raw.queue?.name ?? ""),
    vhost: String(raw.queue?.vhost ?? "/"),
    channelName: channel.name ? String(channel.name) : undefined,
    connectionName: channel.connection_name ? String(channel.connection_name) : undefined,
    peerHost: channel.peer_host ? String(channel.peer_host) : undefined,
    peerPort: num(channel.peer_port),
    user: channel.user ? String(channel.user) : undefined,
    node: channel.node ? String(channel.node) : undefined,
    ackRequired: raw.ack_required !== false,
    prefetchCount: num(raw.prefetch_count) ?? 0,
    active: raw.active !== false,
    activityStatus: raw.activity_status ? String(raw.activity_status) : undefined,
    exclusive: Boolean(raw.exclusive),
    arguments: typeof raw.arguments === "object" && raw.arguments ? raw.arguments : {},
  };
}

export function toExchangeSummary(raw: Raw): ExchangeSummaryDto {
  const stats: Raw | undefined = raw.message_stats;
  return {
    name: String(raw.name ?? ""),
    vhost: String(raw.vhost ?? "/"),
    type: String(raw.type ?? "direct"),
    durable: Boolean(raw.durable),
    autoDelete: Boolean(raw.auto_delete),
    internal: Boolean(raw.internal),
    policy: raw.policy ? String(raw.policy) : undefined,
    publishIn: rate(stats, "publish_in"),
    publishOut: rate(stats, "publish_out"),
    arguments: typeof raw.arguments === "object" && raw.arguments ? raw.arguments : {},
  };
}

export function toConnection(raw: Raw): ConnectionDto {
  const props: Raw = raw.client_properties ?? {};
  return {
    name: String(raw.name ?? ""),
    node: raw.node ? String(raw.node) : undefined,
    state: String(raw.state ?? "unknown"),
    user: String(raw.user ?? ""),
    vhost: String(raw.vhost ?? ""),
    protocol: String(raw.protocol ?? ""),
    channels: num(raw.channels) ?? 0,
    channelMax: num(raw.channel_max),
    peerHost: raw.peer_host ? String(raw.peer_host) : undefined,
    peerPort: num(raw.peer_port),
    host: raw.host ? String(raw.host) : undefined,
    port: num(raw.port),
    ssl: Boolean(raw.ssl),
    sslProtocol: raw.ssl_protocol ? String(raw.ssl_protocol) : undefined,
    authMechanism: raw.auth_mechanism ? String(raw.auth_mechanism) : undefined,
    connectedAt: num(raw.connected_at),
    timeout: num(raw.timeout),
    frameMax: num(raw.frame_max),
    recvBytes: rate(raw, "recv_oct"),
    sendBytes: rate(raw, "send_oct"),
    clientProperties: {
      connectionName: props.connection_name ? String(props.connection_name) : undefined,
      product: props.product ? String(props.product) : undefined,
      version: props.version ? String(props.version) : undefined,
      platform: props.platform ? String(props.platform) : undefined,
      information: props.information ? String(props.information) : undefined,
    },
  };
}

export function toChannel(raw: Raw): ChannelDto {
  const conn: Raw = raw.connection_details ?? {};
  const stats: Raw | undefined = raw.message_stats;
  return {
    name: String(raw.name ?? ""),
    number: num(raw.number) ?? 0,
    connectionName: String(conn.name ?? ""),
    peerHost: conn.peer_host ? String(conn.peer_host) : undefined,
    peerPort: num(conn.peer_port),
    node: raw.node ? String(raw.node) : undefined,
    user: String(raw.user ?? ""),
    vhost: String(raw.vhost ?? ""),
    state: String(raw.state ?? "unknown"),
    consumerCount: num(raw.consumer_count) ?? 0,
    prefetchCount: num(raw.prefetch_count) ?? 0,
    globalPrefetchCount: num(raw.global_prefetch_count) ?? 0,
    messagesUnacknowledged: num(raw.messages_unacknowledged) ?? 0,
    messagesUnconfirmed: num(raw.messages_unconfirmed) ?? 0,
    messagesUncommitted: num(raw.messages_uncommitted) ?? 0,
    acksUncommitted: num(raw.acks_uncommitted) ?? 0,
    confirm: Boolean(raw.confirm),
    transactional: Boolean(raw.transactional),
    publish: rate(stats, "publish"),
    deliverGet: rate(stats, "deliver_get"),
    ack: rate(stats, "ack"),
    redeliver: rate(stats, "redeliver"),
  };
}

/** Best-effort classification of a payload for the Message Inspector. Pure. */
export function detectContentKind(
  payload: string,
  encoding: "string" | "base64",
  contentType: string | undefined,
): "json" | "text" | "binary" {
  if (encoding === "base64") return "binary";
  if (contentType && /json/i.test(contentType)) return "json";
  const trimmed = payload.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return "text";
    }
  }
  return "text";
}

export function toPeekedMessage(raw: Raw, index: number, truncateBytes: number): PeekedMessageDto {
  const payload = typeof raw.payload === "string" ? raw.payload : "";
  const encoding: "string" | "base64" = raw.payload_encoding === "base64" ? "base64" : "string";
  const payloadBytes = num(raw.payload_bytes) ?? Buffer.byteLength(payload);
  const properties: Raw = typeof raw.properties === "object" && raw.properties ? raw.properties : {};
  return {
    index,
    payload,
    payloadEncoding: encoding,
    payloadBytes,
    truncated: payloadBytes > truncateBytes,
    exchange: String(raw.exchange ?? ""),
    routingKey: String(raw.routing_key ?? ""),
    redelivered: Boolean(raw.redelivered),
    messageCount: num(raw.message_count) ?? 0,
    properties,
    contentKind: detectContentKind(payload, encoding, properties.content_type),
  };
}
