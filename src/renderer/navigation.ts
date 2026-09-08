export const RABBITMQ_PAGE_IDS = {
  clusters: "rabbitmq-clusters",
  overview: "rabbitmq-overview",
  queues: "rabbitmq-queues",
  exchanges: "rabbitmq-exchanges",
  connections: "rabbitmq-connections",
} as const;

export type RabbitmqPageId = (typeof RABBITMQ_PAGE_IDS)[keyof typeof RABBITMQ_PAGE_IDS];

export const RABBITMQ_MENU_IDS = {
  root: "rabbitmq",
  clusters: "rabbitmq-clusters",
  overview: "rabbitmq-overview",
  queues: "rabbitmq-queues",
  exchanges: "rabbitmq-exchanges",
  connections: "rabbitmq-connections",
} as const;

/** Declarative page registrations: id + default URL params. */
export const RABBITMQ_CLUSTER_PAGE_MANIFEST = [
  { id: RABBITMQ_PAGE_IDS.clusters, params: { query: "" } },
  { id: RABBITMQ_PAGE_IDS.overview, params: { target: "" } },
  { id: RABBITMQ_PAGE_IDS.queues, params: { target: "", vhost: "", query: "", queue: "", view: "overview" } },
  { id: RABBITMQ_PAGE_IDS.exchanges, params: { target: "", vhost: "", query: "", exchange: "" } },
  { id: RABBITMQ_PAGE_IDS.connections, params: { target: "", query: "", view: "connections" } },
] as const;

export const RABBITMQ_CLUSTER_MENU_MANIFEST = [
  { id: RABBITMQ_MENU_IDS.root, title: "RabbitMQ", pageId: RABBITMQ_PAGE_IDS.clusters },
  {
    id: RABBITMQ_MENU_IDS.clusters,
    parentId: RABBITMQ_MENU_IDS.root,
    title: "Clusters",
    pageId: RABBITMQ_PAGE_IDS.clusters,
  },
  {
    id: RABBITMQ_MENU_IDS.overview,
    parentId: RABBITMQ_MENU_IDS.root,
    title: "Overview",
    pageId: RABBITMQ_PAGE_IDS.overview,
  },
  { id: RABBITMQ_MENU_IDS.queues, parentId: RABBITMQ_MENU_IDS.root, title: "Queues", pageId: RABBITMQ_PAGE_IDS.queues },
  {
    id: RABBITMQ_MENU_IDS.exchanges,
    parentId: RABBITMQ_MENU_IDS.root,
    title: "Exchanges",
    pageId: RABBITMQ_PAGE_IDS.exchanges,
  },
  {
    id: RABBITMQ_MENU_IDS.connections,
    parentId: RABBITMQ_MENU_IDS.root,
    title: "Connections",
    pageId: RABBITMQ_PAGE_IDS.connections,
  },
] as const;
