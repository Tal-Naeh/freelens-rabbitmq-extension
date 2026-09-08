/**
 * Main ↔ Renderer IPC contract for the RabbitMQ extension.
 * Everything crossing the bridge is plain, structured-clone-safe data.
 */

export const RABBITMQ_IPC = {
  discover: "rabbitmq:discover",
  overview: "rabbitmq:overview",
  queues: "rabbitmq:queues",
  queueDetail: "rabbitmq:queue-detail",
  exchanges: "rabbitmq:exchanges",
  exchangeDetail: "rabbitmq:exchange-detail",
  connections: "rabbitmq:connections",
  channels: "rabbitmq:channels",
  consumers: "rabbitmq:consumers",
  messagesPeek: "rabbitmq:messages-peek",
  credentialsSet: "rabbitmq:credentials-set",
  credentialsClear: "rabbitmq:credentials-clear",
  writeModeSet: "rabbitmq:write-mode-set",
  publish: "rabbitmq:publish",
  purgeQueue: "rabbitmq:purge-queue",
  deleteQueue: "rabbitmq:delete-queue",
  deleteExchange: "rabbitmq:delete-exchange",
  disconnect: "rabbitmq:disconnect",
  progress: "rabbitmq:progress",
} as const;

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export type RabbitmqTargetSource = "operator" | "service";

export interface SecretRef {
  namespace: string;
  name: string;
}

/** How the Main process will find credentials for a target (no secret values here). */
export type CredentialHint =
  | { kind: "operator-default-user"; secret: SecretRef }
  | { kind: "secret"; secret: SecretRef; usernameKey?: string; passwordKey?: string; username?: string }
  | { kind: "guess"; username: string }
  | { kind: "none" };

export interface DiscoveredRabbitmqInfo {
  targetId: string;
  name: string;
  namespace: string;
  source: RabbitmqTargetSource;
  /** Provider label for the UI ("RabbitMQ Cluster Operator", "Bitnami chart", "In-cluster Service"). */
  provider: string;
  /** Label selector picking the broker pods (used for the port-forward). */
  podSelector: string;
  /** The Service exposing the Management API, if any. */
  serviceName?: string;
  /** Container port of the Management API (name or number; resolved against the pod when named). */
  managementPort: number | string;
  managementTls: boolean;
  amqpPort?: number;
  amqpTls: boolean;
  credentialHint: CredentialHint;
  /** Operator-reported facts. */
  version?: string;
  replicas?: number;
  readyReplicas?: number;
  conditions?: { type: string; status: string; reason?: string }[];
  /** TLS material for HTTPS management (CA secret), when known. */
  tlsCaSecret?: SecretRef;
}

export interface DiscoverRequest {
  clusterId?: string;
  namespace?: string;
  operationId?: string;
}

// ---------------------------------------------------------------------------
// Target-scoped requests
// ---------------------------------------------------------------------------

export interface TargetRequest {
  clusterId?: string;
  target: DiscoveredRabbitmqInfo;
  operationId?: string;
}

export interface QueuesRequest extends TargetRequest {
  vhost?: string;
}

export interface QueueRequest extends TargetRequest {
  vhost: string;
  queue: string;
}

export interface ExchangesRequest extends TargetRequest {
  vhost?: string;
}

export interface ExchangeRequest extends TargetRequest {
  vhost: string;
  exchange: string;
}

export interface MessagesPeekRequest extends QueueRequest {
  count?: number;
}

export interface CredentialsSetRequest {
  clusterId?: string;
  targetId: string;
  username: string;
  password: string;
}

export interface CredentialsClearRequest {
  clusterId?: string;
  targetId: string;
}

export interface WriteModeSetRequest {
  clusterId?: string;
  targetId: string;
  enabled: boolean;
}

export interface PublishRequest extends TargetRequest {
  vhost: string;
  exchange: string;
  routingKey: string;
  payload: string;
  payloadEncoding: "string" | "base64";
  properties?: Record<string, unknown>;
}

export interface PurgeQueueRequest extends QueueRequest {}
export interface DeleteQueueRequest extends QueueRequest {
  ifEmpty?: boolean;
  ifUnused?: boolean;
}
export interface DeleteExchangeRequest extends ExchangeRequest {
  ifUnused?: boolean;
}

export interface DisconnectRequest {
  clusterId?: string;
  targetId?: string;
}

// ---------------------------------------------------------------------------
// Response DTOs (already normalized from the Management API)
// ---------------------------------------------------------------------------

export interface RateDto {
  /** Absolute count since node start (or undefined when stats are disabled). */
  count?: number;
  /** Per-second rate as reported by the Management API. */
  rate?: number;
}

export interface NodeDto {
  name: string;
  type: string;
  running: boolean;
  uptimeMs?: number;
  memUsed?: number;
  memLimit?: number;
  memAlarm: boolean;
  diskFree?: number;
  diskFreeLimit?: number;
  diskFreeAlarm: boolean;
  fdUsed?: number;
  fdTotal?: number;
  socketsUsed?: number;
  socketsTotal?: number;
  procUsed?: number;
  procTotal?: number;
  partitions: string[];
}

export interface OverviewDto {
  clusterName: string;
  rabbitmqVersion: string;
  erlangVersion: string;
  managementVersion?: string;
  node: string;
  vhosts: string[];
  totals: {
    queues: number;
    exchanges: number;
    connections: number;
    channels: number;
    consumers: number;
  };
  queueTotals: {
    messages: number;
    ready: number;
    unacknowledged: number;
  };
  rates: {
    publish: RateDto;
    deliverGet: RateDto;
    ack: RateDto;
    redeliver: RateDto;
    confirm: RateDto;
    returnUnroutable: RateDto;
  };
  nodes: NodeDto[];
  /** Whether the current credentials may write (used to inform the UI; writes are still gated). */
  userTags: string[];
  /** Connection facts. */
  session: {
    localAddress: string;
    pod: string;
    username: string;
    credentialSource: string;
  };
}

export interface QueueSummaryDto {
  name: string;
  vhost: string;
  type: string;
  state: string;
  node?: string;
  durable: boolean;
  autoDelete: boolean;
  exclusive: boolean;
  policy?: string;
  messages: number;
  ready: number;
  unacknowledged: number;
  consumers: number;
  consumerUtilisation?: number;
  memory?: number;
  messageBytes?: number;
  messageBytesPersistent?: number;
  publish: RateDto;
  deliverGet: RateDto;
  ack: RateDto;
  redeliver: RateDto;
  idleSince?: string;
  arguments: Record<string, unknown>;
}

export interface QueuesDto {
  items: QueueSummaryDto[];
  totalCount: number;
  truncated: boolean;
}

export interface BindingDto {
  source: string;
  destination: string;
  destinationType: "queue" | "exchange";
  routingKey: string;
  vhost: string;
  arguments: Record<string, unknown>;
  propertiesKey?: string;
}

export interface ConsumerDto {
  consumerTag: string;
  queue: string;
  vhost: string;
  channelName?: string;
  connectionName?: string;
  peerHost?: string;
  peerPort?: number;
  user?: string;
  node?: string;
  ackRequired: boolean;
  prefetchCount: number;
  active: boolean;
  activityStatus?: string;
  exclusive: boolean;
  arguments: Record<string, unknown>;
}

export interface QueueDetailDto {
  queue: QueueSummaryDto;
  bindings: BindingDto[];
  consumers: ConsumerDto[];
  /** Additional facts surfaced only on the detail endpoint. */
  headMessageTimestamp?: string;
  messagesPersistent?: number;
  messagesRam?: number;
  garbageCollection?: Record<string, unknown>;
  effectivePolicyDefinition?: Record<string, unknown>;
}

export interface ExchangeSummaryDto {
  name: string;
  vhost: string;
  type: string;
  durable: boolean;
  autoDelete: boolean;
  internal: boolean;
  policy?: string;
  publishIn: RateDto;
  publishOut: RateDto;
  arguments: Record<string, unknown>;
}

export interface ExchangesDto {
  items: ExchangeSummaryDto[];
  totalCount: number;
  truncated: boolean;
}

export interface ExchangeDetailDto {
  exchange: ExchangeSummaryDto;
  /** Bindings where this exchange is the source. */
  bindingsOut: BindingDto[];
  /** Bindings where this exchange is the destination (exchange-to-exchange). */
  bindingsIn: BindingDto[];
}

export interface ConnectionDto {
  name: string;
  node?: string;
  state: string;
  user: string;
  vhost: string;
  protocol: string;
  channels: number;
  channelMax?: number;
  peerHost?: string;
  peerPort?: number;
  host?: string;
  port?: number;
  ssl: boolean;
  sslProtocol?: string;
  authMechanism?: string;
  connectedAt?: number;
  timeout?: number;
  frameMax?: number;
  recvBytes: RateDto;
  sendBytes: RateDto;
  clientProperties: {
    connectionName?: string;
    product?: string;
    version?: string;
    platform?: string;
    information?: string;
  };
}

export interface ConnectionsDto {
  items: ConnectionDto[];
  totalCount: number;
  truncated: boolean;
}

export interface ChannelDto {
  name: string;
  number: number;
  connectionName: string;
  peerHost?: string;
  peerPort?: number;
  node?: string;
  user: string;
  vhost: string;
  state: string;
  consumerCount: number;
  prefetchCount: number;
  globalPrefetchCount: number;
  messagesUnacknowledged: number;
  messagesUnconfirmed: number;
  messagesUncommitted: number;
  acksUncommitted: number;
  confirm: boolean;
  transactional: boolean;
  publish: RateDto;
  deliverGet: RateDto;
  ack: RateDto;
  redeliver: RateDto;
}

export interface ChannelsDto {
  items: ChannelDto[];
  totalCount: number;
  truncated: boolean;
}

export interface ConsumersDto {
  items: ConsumerDto[];
  totalCount: number;
  truncated: boolean;
}

export interface PeekedMessageDto {
  /** Position from the head of the queue at fetch time (0 = head). */
  index: number;
  payload: string;
  payloadEncoding: "string" | "base64";
  payloadBytes: number;
  truncated: boolean;
  exchange: string;
  routingKey: string;
  redelivered: boolean;
  messageCount: number;
  properties: Record<string, unknown>;
  /** Best-effort detected content kind for the inspector. */
  contentKind: "json" | "text" | "binary";
}

export interface MessagesPeekDto {
  vhost: string;
  queue: string;
  requested: number;
  /** Always `ack_requeue_true` — messages are never consumed by the inspector. */
  ackMode: "ack_requeue_true";
  messages: PeekedMessageDto[];
}

export interface PublishResultDto {
  routed: boolean;
}

export interface WriteResultDto {
  ok: true;
}

export interface WriteModeStateDto {
  targetId: string;
  enabled: boolean;
}

export interface CredentialsStateDto {
  targetId: string;
  hasManualCredentials: boolean;
}

// ---------------------------------------------------------------------------
// Progress broadcast
// ---------------------------------------------------------------------------

export interface RabbitmqProgressEvent {
  operationId: string;
  /** 0..100 */
  value: number;
  phase: "discovery" | "credentials" | "port-forward" | "api" | "done";
  label: string;
  detail?: string;
}

/** Error shape thrown across IPC (Electron serializes `Error` to its message; we keep a code too). */
export interface RabbitmqIpcErrorShape {
  code:
    | "unauthorized"
    | "forbidden"
    | "not-found"
    | "write-mode-disabled"
    | "no-pod"
    | "no-credentials"
    | "timeout"
    | "unreachable"
    | "unknown";
  message: string;
  status?: number;
}
