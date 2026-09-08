# Changelog

## 0.1.7 (unreleased)

Initial implementation.

- Fix: Cluster/vhost dropdown menus no longer render behind the sticky table header (portal z-index).

- Fix: queue/exchange detail drawers and the Connections tabs keep their state across background refreshes and page re-mounts (renderer-session SelectionStore; URL read only as a deep link, never written on open).

- Resizable table columns: drag a header cell's right edge, double-click it to reset; widths persist per table.

- Discovery of `RabbitmqCluster` CRs and Management-API Services (operator, Bitnami, generic).
- Credential resolution from operator default-user Secrets and workload env Secret refs; manual override.
- SPDY port-forward to a Ready broker pod + core-Node HTTP client for the Management API.
- Pages: Clusters, Overview (totals, rates, nodes), Queues (+ detail drawer, bindings, consumers, Message
  Inspector with `ack_requeue_true`), Exchanges (+ bindings, publish), Connections/Channels/Consumers.
- Session-scoped, confirmed Write Mode gating publish / purge / delete; enforced in Main.
- Unit tests for the engine and UI helpers; Docker e2e harness verified against RabbitMQ 4.3.5.
