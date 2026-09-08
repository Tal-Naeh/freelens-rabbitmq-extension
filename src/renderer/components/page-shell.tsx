import { Renderer } from "@freelensapp/extensions";
import { useEffect, useState } from "react";
import styles from "../styles.scss?inline";

import type { ReactNode } from "react";

import type { DiscoveredRabbitmqInfo, RabbitmqIpcErrorShape } from "../../common/ipc";
import type { WriteModeStore } from "../write-mode-store";

const STYLE_ID = "freelens-rabbitmq-extension-styles";

function ensureStyles(): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    document.head.append(style);
  }
  if (style.textContent !== styles) style.textContent = styles;
}

// ---------------------------------------------------------------------------

export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => ensureStyles(), []);
  return (
    <div className="RmqPage">
      <header className="RmqHeader">
        <div className="RmqHeaderText">
          <h1>{title}</h1>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        {actions ? <div className="RmqHeaderActions">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function TargetSelector({
  targets,
  selected,
  onChange,
  disabled,
}: {
  targets: DiscoveredRabbitmqInfo[];
  selected?: DiscoveredRabbitmqInfo;
  onChange: (targetId: string) => void;
  disabled?: boolean;
}) {
  const options: Renderer.Component.SelectOption<string>[] = targets.map((t) => ({
    value: t.targetId,
    label: `${t.namespace}/${t.name}`,
  }));
  return (
    <label className="RmqTargetSelector">
      <span>Cluster</span>
      <Renderer.Component.Select
        options={options}
        value={selected?.targetId}
        onChange={(option: Renderer.Component.SelectOption<string> | null) => {
          if (option) onChange(option.value);
        }}
        isDisabled={disabled || options.length === 0}
        placeholder={options.length === 0 ? "No RabbitMQ found" : "Select a RabbitMQ cluster"}
        themeName="lens"
        menuPosition="fixed"
      />
    </label>
  );
}

// ---------------------------------------------------------------------------

export interface Metric {
  label: string;
  value: ReactNode;
  tone?: "warning" | "error" | "ok";
  title?: string;
}

export function MetricStrip({ metrics, ariaLabel }: { metrics: Metric[]; ariaLabel: string }) {
  return (
    <section className="RmqMetrics" aria-label={ariaLabel}>
      {metrics.map((m) => (
        <div key={m.label} className={`RmqMetric ${m.tone ?? ""}`.trim()} title={m.title}>
          <strong>{m.value}</strong>
          <span>{m.label}</span>
        </div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------

export function WriteModeToggle({
  store,
  target,
  enabled,
}: {
  store: WriteModeStore;
  target?: DiscoveredRabbitmqInfo;
  enabled: boolean;
}) {
  if (!target) return null;
  const onChange = (checked: boolean) => {
    if (!checked) {
      void store.set(target.targetId, false);
      return;
    }
    Renderer.Component.ConfirmDialog.open({
      labelOk: "Enable Write Mode",
      labelCancel: "Stay read-only",
      message: (
        <div className="RmqConfirm">
          <p>
            <strong>
              Enable Write Mode for {target.namespace}/{target.name}?
            </strong>
          </p>
          <p>
            This unlocks publishing messages, purging queues and deleting queues/exchanges on a live broker. Each action
            still asks for confirmation. Write Mode is per-target and resets when Freelens restarts.
          </p>
        </div>
      ),
      ok: async () => {
        try {
          await store.set(target.targetId, true);
          Renderer.Component.Notifications.shortInfo(`Write Mode enabled for ${target.name}`);
        } catch (err) {
          Renderer.Component.Notifications.error(`Could not enable Write Mode: ${(err as Error).message}`);
        }
      },
    });
  };
  return (
    <div
      className={`RmqWriteMode ${enabled ? "armed" : ""}`.trim()}
      title="Mutating actions are disabled until enabled"
    >
      <Renderer.Component.Icon material={enabled ? "lock_open" : "lock"} small />
      <span>{enabled ? "Write Mode" : "Read-only"}</span>
      <Renderer.Component.Switch checked={enabled} onChange={onChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function CredentialsForm({
  target,
  onSubmit,
  onClear,
  busy,
}: {
  target: DiscoveredRabbitmqInfo;
  onSubmit: (username: string, password: string) => Promise<void>;
  onClear?: () => Promise<void>;
  busy?: boolean;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="RmqCredentials">
      <p>
        Enter Management API credentials for{" "}
        <strong>
          {target.namespace}/{target.name}
        </strong>
        . They are held in memory for this session only and never written to disk.
      </p>
      <div className="RmqCredentialsRow">
        <Renderer.Component.Input
          theme="round-black"
          placeholder="Username"
          value={username}
          onChange={setUsername}
          autoFocus
        />
        <Renderer.Component.Input
          theme="round-black"
          type="password"
          placeholder="Password"
          value={password}
          onChange={setPassword}
          onSubmit={() => void onSubmit(username, password)}
        />
        <Renderer.Component.Button
          primary
          label="Connect"
          disabled={busy || !username || !password}
          onClick={() => void onSubmit(username, password)}
        />
        {onClear ? (
          <Renderer.Component.Button plain label="Use discovered" disabled={busy} onClick={() => void onClear()} />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function ErrorPanel({
  error,
  onRetry,
  children,
}: {
  error: RabbitmqIpcErrorShape;
  onRetry?: () => void;
  children?: ReactNode;
}) {
  const hint = errorHint(error);
  return (
    <section className={`RmqError ${error.code}`} role="alert">
      <div className="RmqErrorHead">
        <Renderer.Component.Icon material="error_outline" />
        <div>
          <strong>{errorTitle(error)}</strong>
          <p>{error.message}</p>
          {hint ? <p className="RmqErrorHint">{hint}</p> : null}
        </div>
        {onRetry ? <Renderer.Component.Button plain label="Retry" onClick={onRetry} /> : null}
      </div>
      {children}
    </section>
  );
}

function errorTitle(error: RabbitmqIpcErrorShape): string {
  switch (error.code) {
    case "unauthorized":
      return "Credentials rejected";
    case "no-credentials":
      return "No credentials found";
    case "forbidden":
      return "Not permitted";
    case "not-found":
      return "Not found";
    case "write-mode-disabled":
      return "Write Mode is off";
    case "no-pod":
      return "No running broker pod";
    case "timeout":
      return "Timed out";
    case "unreachable":
      return "Management API unreachable";
    default:
      return "Something went wrong";
  }
}

function errorHint(error: RabbitmqIpcErrorShape): string | undefined {
  switch (error.code) {
    case "unauthorized":
    case "no-credentials":
      return "Provide a Management API user below, or check the Secret referenced by the operator/workload.";
    case "forbidden":
      return "The user lacks a management tag (monitoring/management/administrator) or vhost permission.";
    case "unreachable":
      return "The port-forward could not reach the pod. Is the management plugin enabled on port 15672?";
    case "no-pod":
      return "Wait for a broker pod to become Ready, or check the label selector used for discovery.";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------

export function EmptyState({
  icon = "inbox",
  title,
  children,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="RmqEmpty">
      <Renderer.Component.Icon material={icon} big />
      <strong>{title}</strong>
      {children ? <div>{children}</div> : null}
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="RmqLoading">
      <Renderer.Component.Spinner />
      <span>{label}</span>
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="RmqToolbar">{children}</div>;
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Renderer.Component.Input
      className="RmqSearch"
      theme="round-black"
      iconLeft="search"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  );
}

export function KeyValueList({ entries }: { entries: [string, ReactNode][] }) {
  return (
    <dl className="RmqKv">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ArgumentsView({ args }: { args: Record<string, unknown> }) {
  const entries = Object.entries(args);
  if (entries.length === 0) return <span className="RmqMuted">none</span>;
  return (
    <ul className="RmqArgs">
      {entries.map(([k, v]) => (
        <li key={k}>
          <code>{k}</code> = <code>{typeof v === "string" ? v : JSON.stringify(v)}</code>
        </li>
      ))}
    </ul>
  );
}

export function StatusDot({ state }: { state: string }) {
  const tone = /running|open|idle/.test(state)
    ? "ok"
    : /flow|blocking|blocked/.test(state)
      ? "warning"
      : /down|closed|crashed|stopped/.test(state)
        ? "error"
        : "";
  return (
    <span className={`RmqState ${tone}`.trim()}>
      <i />
      {state}
    </span>
  );
}
