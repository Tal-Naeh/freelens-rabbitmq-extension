import { RABBITMQ_HTTP_TIMEOUT_MS, RABBITMQ_SESSION_IDLE_MS } from "../../common/constants";
import { RabbitmqError } from "../../common/errors";
import { resolveCredentials, resolveManagementTls } from "./credentials";
import { createJsonHttpClient } from "./http";
import { RabbitmqManagementClient } from "./management-client";
import { resolveManagementPod } from "./pod-resolver";
import { openTunnel } from "./port-forward";

import type { DiscoveredRabbitmqInfo, RabbitmqProgressEvent } from "../../common/ipc";
import type { ResolvedCredentials } from "./credentials";
import type { KubeReader } from "./kube-reader";
import type { Forwarder, Tunnel } from "./port-forward";

export type ProgressReporter = (progress: Omit<RabbitmqProgressEvent, "operationId">) => void;

export interface RabbitmqSession {
  readonly key: string;
  readonly target: DiscoveredRabbitmqInfo;
  readonly client: RabbitmqManagementClient;
  readonly tunnel: Tunnel;
  readonly username: string;
  readonly credentialSource: string;
  readonly userTags: string[];
  lastUsedAt: number;
}

export interface SessionManagerDependencies {
  createReader(clusterId?: string): KubeReader;
  createForwarder(clusterId?: string): Forwarder;
  idleMs?: number;
  httpTimeoutMs?: number;
  now?: () => number;
}

export function sessionKey(clusterId: string | undefined, targetId: string): string {
  return `${clusterId ?? "active"}::${targetId}`;
}

/**
 * Owns every live target session: one port-forward tunnel + one authenticated Management API
 * client per (cluster, target). Also holds the two per-session safety switches:
 *  - manual credential overrides (kept in Main memory only, never persisted);
 *  - the Write Mode gate — every mutating IPC handler must pass {@link assertWriteMode}.
 */
export class RabbitmqSessionManager {
  private readonly sessions = new Map<string, RabbitmqSession>();
  private readonly pending = new Map<string, Promise<RabbitmqSession>>();
  private readonly manualCredentials = new Map<string, ResolvedCredentials>();
  private readonly writeMode = new Set<string>();
  private readonly idleTimers = new Map<string, NodeJS.Timeout>();
  private readonly idleMs: number;
  private readonly httpTimeoutMs: number;
  private readonly now: () => number;

  constructor(private readonly deps: SessionManagerDependencies) {
    this.idleMs = deps.idleMs ?? RABBITMQ_SESSION_IDLE_MS;
    this.httpTimeoutMs = deps.httpTimeoutMs ?? RABBITMQ_HTTP_TIMEOUT_MS;
    this.now = deps.now ?? Date.now;
  }

  // -- credentials -------------------------------------------------------------------

  setManualCredentials(clusterId: string | undefined, targetId: string, username: string, password: string): void {
    const key = sessionKey(clusterId, targetId);
    this.manualCredentials.set(key, { username, password, source: "manual (this session)" });
    this.close(key);
  }

  clearManualCredentials(clusterId: string | undefined, targetId: string): void {
    const key = sessionKey(clusterId, targetId);
    this.manualCredentials.delete(key);
    this.close(key);
  }

  hasManualCredentials(clusterId: string | undefined, targetId: string): boolean {
    return this.manualCredentials.has(sessionKey(clusterId, targetId));
  }

  // -- write mode --------------------------------------------------------------------

  setWriteMode(clusterId: string | undefined, targetId: string, enabled: boolean): boolean {
    const key = sessionKey(clusterId, targetId);
    if (enabled) this.writeMode.add(key);
    else this.writeMode.delete(key);
    return enabled;
  }

  isWriteMode(clusterId: string | undefined, targetId: string): boolean {
    return this.writeMode.has(sessionKey(clusterId, targetId));
  }

  /** Throws unless Write Mode was explicitly enabled for this target in this session. */
  assertWriteMode(clusterId: string | undefined, targetId: string, action: string): void {
    if (!this.isWriteMode(clusterId, targetId)) {
      throw new RabbitmqError(
        "write-mode-disabled",
        `${action} is blocked: Write Mode is off for this RabbitMQ target. Enable it from the page header first.`,
      );
    }
  }

  // -- sessions ----------------------------------------------------------------------

  /** Runs `fn` against a live session, transparently reopening the tunnel once if it went stale. */
  async withSession<T>(
    clusterId: string | undefined,
    target: DiscoveredRabbitmqInfo,
    report: ProgressReporter,
    fn: (session: RabbitmqSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.getOrOpen(clusterId, target, report);
    try {
      const result = await fn(session);
      this.touch(session);
      return result;
    } catch (err) {
      if (err instanceof RabbitmqError && err.code === "unreachable") {
        this.close(session.key);
        const fresh = await this.getOrOpen(clusterId, target, report);
        const result = await fn(fresh);
        this.touch(fresh);
        return result;
      }
      if (err instanceof RabbitmqError && err.code === "unauthorized") this.close(session.key);
      throw err;
    }
  }

  getOrOpen(
    clusterId: string | undefined,
    target: DiscoveredRabbitmqInfo,
    report: ProgressReporter,
  ): Promise<RabbitmqSession> {
    const key = sessionKey(clusterId, target.targetId);
    const existing = this.sessions.get(key);
    if (existing) return Promise.resolve(existing);
    const inflight = this.pending.get(key);
    if (inflight) return inflight;
    const opening = this.open(key, clusterId, target, report).finally(() => this.pending.delete(key));
    this.pending.set(key, opening);
    return opening;
  }

  private async open(
    key: string,
    clusterId: string | undefined,
    target: DiscoveredRabbitmqInfo,
    report: ProgressReporter,
  ): Promise<RabbitmqSession> {
    const reader = this.deps.createReader(clusterId);

    report({ value: 10, phase: "credentials", label: "Resolving credentials", detail: describeHint(target) });
    const credentials = this.manualCredentials.get(key) ?? (await resolveCredentials(reader, target.credentialHint));
    const tls = await resolveManagementTls(reader, target);

    report({ value: 35, phase: "port-forward", label: "Locating a broker pod", detail: target.podSelector });
    const podPort = await resolveManagementPod(reader, target);

    report({
      value: 55,
      phase: "port-forward",
      label: "Opening port-forward",
      detail: `${podPort.namespace}/${podPort.pod}:${podPort.port}`,
    });
    const tunnel = await openTunnel(this.deps.createForwarder(clusterId), podPort);

    const client = new RabbitmqManagementClient(
      createJsonHttpClient({
        host: tunnel.localHost,
        port: tunnel.localPort,
        auth: { username: credentials.username, password: credentials.password },
        tls,
        timeoutMs: this.httpTimeoutMs,
      }),
    );

    report({ value: 80, phase: "api", label: "Authenticating with the Management API", detail: credentials.username });
    let who: { name: string; tags: string[] };
    try {
      who = await client.whoami();
    } catch (err) {
      tunnel.close();
      throw err;
    }

    const session: RabbitmqSession = {
      key,
      target,
      client,
      tunnel,
      username: who.name || credentials.username,
      credentialSource: credentials.source,
      userTags: who.tags,
      lastUsedAt: this.now(),
    };
    this.sessions.set(key, session);
    this.touch(session);
    report({ value: 100, phase: "done", label: "Connected" });
    return session;
  }

  private touch(session: RabbitmqSession): void {
    session.lastUsedAt = this.now();
    const existing = this.idleTimers.get(session.key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => this.close(session.key), this.idleMs);
    timer.unref?.();
    this.idleTimers.set(session.key, timer);
  }

  close(key: string): void {
    const timer = this.idleTimers.get(key);
    if (timer) clearTimeout(timer);
    this.idleTimers.delete(key);
    const session = this.sessions.get(key);
    if (!session) return;
    this.sessions.delete(key);
    session.tunnel.close();
  }

  closeTarget(clusterId: string | undefined, targetId: string): void {
    this.close(sessionKey(clusterId, targetId));
  }

  closeAll(): void {
    for (const key of [...this.sessions.keys()]) this.close(key);
    this.writeMode.clear();
    this.manualCredentials.clear();
  }

  openSessionCount(): number {
    return this.sessions.size;
  }
}

function describeHint(target: DiscoveredRabbitmqInfo): string {
  const hint = target.credentialHint;
  switch (hint.kind) {
    case "operator-default-user":
    case "secret":
      return `Secret ${hint.secret.namespace}/${hint.secret.name}`;
    case "guess":
      return `default user "${hint.username}"`;
    case "none":
      return "no known credential source";
  }
}
