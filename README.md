# Freelens RabbitMQ Extension

[![npm](https://img.shields.io/npm/v/%40tal-naeh%2Ffreelens-rabbitmq-extension)](https://www.npmjs.com/package/@tal-naeh/freelens-rabbitmq-extension)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A **cluster-native RabbitMQ console** inside [Freelens](https://freelens.app). It discovers RabbitMQ
clusters in the Kubernetes cluster you are already connected to, pulls credentials from the
Secrets the operator or chart created, opens a port-forward to the Management API and lets you
inspect queues, exchanges, bindings, connections, channels, consumers and messages — **read-only
by default**.

Modelled on the [freelens-kafka-extension](https://github.com/freelensapp/freelens-kafka-extension)
architecture, tailored for RabbitMQ.

## Features

- **Autodiscovery** — `RabbitmqCluster` resources (RabbitMQ Cluster Operator) and plain `Service`s
  exposing the Management API (`15672`/`15671`) next to AMQP (`5672`/`5671`): Bitnami charts,
  hand-rolled StatefulSets.
- **Zero-config credentials** — the operator's `<cluster>-default-user` Secret, or the Secret referenced
  by `RABBITMQ_DEFAULT_USER/PASS` / `RABBITMQ_USERNAME/PASSWORD` env vars on the workload. TLS
  management listeners use the operator's CA Secret. Manual credentials can be entered per session
  (held in the Main process only, never persisted).
- **Lightweight transport** — no AMQP client. A Kubernetes SPDY port-forward to one broker pod's
  management port plus a small JSON-over-HTTP client on Node's core `http`/`https`.
- **Resizable columns** — drag the right edge of any table header to resize, double-click it to reset;
  widths are remembered per table.
- **Views**
  - *Clusters*: every discovered target with provider, version, replicas, ports, credential source.
  - *Overview*: object totals, message rates, cluster/session facts, per-node memory/disk/FD gauges and alarms.
  - *Queues*: sortable table (ready/unacked/total, consumers, publish/deliver rates, memory, features);
    detail drawer with definition, bindings, consumers and the **Message Inspector**.
  - *Exchanges*: table with publish in/out; drawer with outgoing/incoming bindings and a Publish form.
  - *Connections*: live tabs for connections, channels (prefetch, unacked, confirm/tx mode) and consumers.
- **Safety first**
  - Everything is read-only until you flip **Write Mode** for a target — a per-session switch with an
    explicit confirmation, mirrored and enforced in the Main process (`write-mode-disabled` error otherwise).
  - Message peeks always use `ackmode: ack_requeue_true`; nothing is consumed or lost (peeked
    messages do get the `redelivered` flag — a Management API property).
  - Every mutating action (publish, purge, delete queue/exchange) asks for confirmation again.
  - Lists are bounded and paginated (`page_size=500`, max 5 000 objects); peeks are capped at 50 messages.

## Requirements

- Freelens ≥ 1.8 (developed and verified against 1.10.3).
- The RabbitMQ **management plugin** enabled on the brokers (it is in `*-management` images, the
  Cluster Operator and the Bitnami chart).
- A kubeconfig on your machine for the cluster (the SPDY port-forward uses your kubeconfig context,
  discovery uses Freelens' own connection).

## Installation

Open the Freelens **Extensions** page (`ctrl`+`shift`+`E` / `cmd`+`shift`+`E`), paste the npm name and click **Install**:

```text
@tal-naeh/freelens-rabbitmq-extension
```

Alternatively download the `.tgz` from the
[GitHub releases](https://github.com/Tal-Naeh/freelens-rabbitmq-extension/releases) page and drag it
into the Freelens window, or paste its path on the Extensions page.

## Usage

1. Connect to a cluster in Freelens. A **RabbitMQ** entry appears in the sidebar.
2. *Clusters* lists what was discovered. Click **Open**.
3. Browse *Overview*, *Queues*, *Exchanges*, *Connections*. Pick a different target from the header selector.
4. To peek at messages: open a queue → *Messages* tab → **Peek**.
5. To mutate: flip **Read-only → Write Mode** in the header, confirm, then use Purge/Delete/Publish.
   Write Mode resets whenever Freelens restarts.

If discovery finds the cluster but credentials fail, the error panel offers a username/password form.

## How connectivity works

```
Renderer (React pages) ── IPC ──▶ Main (Node)
                                   ├─ discovery:  Main.K8s (Freelens cluster connection) → CRDs, Services, Workloads
                                   ├─ credentials: Secrets → username/password (+ CA)
                                   ├─ port-forward: @kubernetes/client-node SPDY → pod:15672 ⇄ 127.0.0.1:<random>
                                   └─ HTTP client: GET/POST/DELETE /api/... (Basic auth)
```

One session (tunnel + client) per target, reused across pages, closed after 5 minutes idle, reopened
transparently if the tunnel dies.

## Development

```sh
pnpm install
pnpm type:check      # tsc
pnpm lint:check      # biome
pnpm test:unit       # vitest (pure engine + UI helpers)
pnpm build           # electron-vite → out/, then a Main-bundle smoke test
pnpm pack            # prepack runs the build, then writes the .tgz in the repo root
```

End-to-end against a real broker (Docker, no Kubernetes):

```sh
pnpm rabbitmq:up     # rabbitmq:4-management on 127.0.0.1:15672 (user e2e / e2e-password)
pnpm itest           # auth, overview, publish, list, peek (ack_requeue_true), purge, delete
pnpm rabbitmq:down
```

### Install a local build in Freelens

```sh
pnpm pack
# → tal-naeh-freelens-rabbitmq-extension-<version>.tgz
```

Open Freelens → Extensions (`cmd`+`shift`+`E`) → paste the absolute path of the `.tgz` (or drag it into
the window) → **Install** → enable. Rebuild + reinstall to iterate; Freelens hot-reloads on reinstall.

## Repository layout

- `src/common/` — IPC contract (channels + DTOs), constants, error shape shared by both processes.
- `src/main/` — Main process: `ipc.ts` handlers, `kubeconfig-resolver.ts`, `catalog-kube-reader.ts`,
  and the engine in `rabbitmq/` (discovery, credentials, pod-resolver, port-forward, http,
  management-client, normalize, session-manager), each with colocated `*.test.ts`.
- `src/renderer/` — pages (`pages/`), shared UI (`components/`), IPC client, hooks, Write Mode store.
- `test/e2e/` — Docker compose + live-broker integration script.

## License

MIT
