# Architecture

Two processes, as every Freelens extension:

| Layer | Location | Role |
| --- | --- | --- |
| Renderer | `src/renderer/` | React pages registered as `clusterPages` + sidebar menus. Talks to Main only through `RabbitmqIpcRenderer`. |
| Common | `src/common/` | `ipc.ts` (channel names + DTOs), `errors.ts` (typed error serialised through Electron's message-only rejection), `constants.ts`, `target.ts`. |
| Main | `src/main/` | `RabbitmqIpcMain` registers one handler per channel and delegates to the engine. |

## Engine (`src/main/rabbitmq/`)

```text
discover ──▶ DiscoveredRabbitmqInfo[]      (discovery.ts; KubeReader seam)
                 │
      target ────┤ SessionManager.withSession(clusterId, target)
                 │   ├─ resolveCredentials(hint)     credentials.ts   (Secrets → user/pass, CA)
                 │   ├─ resolveManagementPod         pod-resolver.ts  (Ready pod + numeric port)
                 │   ├─ openTunnel(forwarder)        port-forward.ts  (local TCP → SPDY → pod)
                 │   └─ RabbitmqManagementClient     management-client.ts + http.ts + normalize.ts
                 └─ assertWriteMode()                for publish / purge / delete
```

- **KubeReader** is the only Kubernetes read seam: production uses `Main.K8s` through Freelens'
  connected cluster (`catalog-kube-reader.ts`); a client-node implementation exists for scripts/tests.
- **Forwarder** is the only Kubernetes write-ish seam: production is `PortForward` from
  `@kubernetes/client-node` on the user's kubeconfig (`kubeconfig-resolver.ts` finds it via the catalog
  entity's `spec.kubeconfigPath`, falling back to the default kubeconfig + context name).
- Sessions are keyed by `(clusterId, targetId)`, idle-closed after 5 min, reopened once on `unreachable`.
- Manual credentials and the Write Mode set live only in `RabbitmqSessionManager` memory.

## Safety model

1. Renderer `WriteModeStore` is session-scoped and unpersisted; enabling it opens a `ConfirmDialog`.
2. The store calls `writeModeSet` so Main's gate is armed for that target.
3. Every mutating handler calls `assertWriteMode` first; a disarmed target yields `write-mode-disabled`.
4. Each mutating UI action confirms again with the concrete object name.
5. `peekMessages` hard-codes `ackmode: ack_requeue_true`, caps `count` at 50, truncates payloads at 64 KiB.

## Testing

- `vitest` unit tests colocated with the engine and UI helpers (fakes for `KubeReader`, `JsonHttpClient`,
  a TCP-pipe `Forwarder`).
- `test/e2e/integration.local.ts` runs the real HTTP client + normalisers against a Docker broker.
- `scripts/smoke-main.cjs` loads the built Main bundle with host globals stubbed (catches bundling errors).
