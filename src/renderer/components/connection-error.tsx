import { Renderer } from "@freelensapp/extensions";
import { useState } from "react";
import { CredentialsForm, ErrorPanel } from "./page-shell";

import type { DiscoveredRabbitmqInfo, RabbitmqIpcErrorShape } from "../../common/ipc";
import type { RabbitmqIpcRenderer } from "../ipc-client";

const CREDENTIAL_CODES = new Set<RabbitmqIpcErrorShape["code"]>(["unauthorized", "no-credentials", "forbidden"]);

/**
 * Error panel for target-scoped loads. When the failure is about credentials it offers a
 * manual username/password form (values go straight to Main and stay there).
 */
export function ConnectionErrorPanel({
  error,
  target,
  client,
  clusterId,
  onRetry,
}: {
  error: RabbitmqIpcErrorShape;
  target?: DiscoveredRabbitmqInfo;
  client: RabbitmqIpcRenderer;
  clusterId?: string;
  onRetry: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const showCredentials = target && CREDENTIAL_CODES.has(error.code);

  const submit = async (username: string, password: string) => {
    if (!target) return;
    setBusy(true);
    try {
      await client.credentialsSet({ clusterId, targetId: target.targetId, username, password });
      onRetry();
    } catch (err) {
      Renderer.Component.Notifications.error(`Could not store credentials: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await client.credentialsClear({ clusterId, targetId: target.targetId });
      onRetry();
    } finally {
      setBusy(false);
    }
  };

  return (
    <ErrorPanel error={error} onRetry={onRetry}>
      {showCredentials ? <CredentialsForm target={target} onSubmit={submit} onClear={clear} busy={busy} /> : null}
    </ErrorPanel>
  );
}
