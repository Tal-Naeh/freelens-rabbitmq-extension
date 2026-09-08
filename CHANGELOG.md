# Changelog

## 0.2.2

- Fix: Clusters page cards — name truncates with an ellipsis instead of wrapping, tags wrap inside the card, facts laid out as a grid; no more overlap/overflow.

## 0.2.1

- Fix: table cells that carried a tooltip `title` rendered the tooltip text instead of the value (Memory, Disk free, Client, Prefetch columns).
- Restore the full freelensapp workflow set (trunk, Renovate, osv-scanner, npm audit/dedupe) and add CONTRIBUTING.

## 0.2.0

First published release, as `@tal-naeh/freelens-rabbitmq-extension` on npm.

- Fix: detail drawers open reliably — the core Drawer treated the opening click itself as an outside click; drawers now open one tick later and opening clicks are marked handled.

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
