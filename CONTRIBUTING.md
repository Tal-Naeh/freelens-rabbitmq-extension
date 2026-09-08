# Contributing

Thanks for helping improve the Freelens RabbitMQ extension.

## Development setup

```sh
pnpm install
pnpm type:check && pnpm lint:check && pnpm knip:check && pnpm test:unit
pnpm pack            # builds and writes the .tgz to install in Freelens (Extensions → path to .tgz)
```

Run the engine against a real broker without Kubernetes:

```sh
pnpm rabbitmq:up && pnpm itest && pnpm rabbitmq:down
```

## Ground rules

- **Read-only by default.** Anything that mutates a broker (publish, purge, delete, policies…) must be gated by
  `RabbitmqSessionManager.assertWriteMode` in Main *and* confirmed in the UI. Message peeks always use
  `ackmode: ack_requeue_true`.
- **Secrets stay in Main.** Credential values are read from Kubernetes Secrets in the Main process and never sent
  to the renderer or written to disk.
- **No heavy clients.** The Management API is reached over the port-forward with Node's core `http`/`https`.
- **Bounded reads.** Lists are paginated and capped; add limits to any new endpoint.
- Keep engine modules pure where possible and colocate `*.test.ts`; UI hooks that touch React get jsdom tests
  (`src/renderer/hooks.test.tsx`).

## Pull requests

1. Branch from `main`; keep PRs focused.
2. `pnpm biome:fix` before committing; CI runs type-check, lint, knip and unit tests.
3. Add a line to `CHANGELOG.md`.
4. For UI changes attach a screenshot from Freelens.

## Releasing

Bump `version` in `package.json`, commit, tag `vX.Y.Z` and push the tag. The Release workflow builds, publishes
to npm (when `NPM_TOKEN` is configured) and attaches the `.tgz` to a GitHub Release.
