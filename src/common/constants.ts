/** Ports RabbitMQ conventionally exposes; used by Service-based discovery. */
export const RABBITMQ_MANAGEMENT_PORT = 15672;
export const RABBITMQ_MANAGEMENT_TLS_PORT = 15671;
export const RABBITMQ_AMQP_PORT = 5672;
export const RABBITMQ_AMQPS_PORT = 5671;

/** RabbitMQ Cluster Operator CRD coordinates. */
export const RABBITMQ_CLUSTER_CRD = {
  group: "rabbitmq.com",
  version: "v1beta1",
  plural: "rabbitmqclusters",
  kind: "RabbitmqCluster",
} as const;

/** Management API request timeout. */
export const RABBITMQ_HTTP_TIMEOUT_MS = 15_000;
/** Idle time after which a target session (port-forward) is torn down. */
export const RABBITMQ_SESSION_IDLE_MS = 5 * 60_000;
/** Maximum objects fetched per list (bounded, paginated through the Management API). */
export const RABBITMQ_LIST_PAGE_SIZE = 500;
export const RABBITMQ_LIST_MAX_ITEMS = 5_000;
/** Message peek bounds. */
export const RABBITMQ_PEEK_MAX_COUNT = 50;
export const RABBITMQ_PEEK_DEFAULT_COUNT = 10;
export const RABBITMQ_PEEK_TRUNCATE_BYTES = 64 * 1024;
/** Auto-refresh interval for live views (connections/channels/overview). */
export const RABBITMQ_LIVE_REFRESH_MS = 5_000;
