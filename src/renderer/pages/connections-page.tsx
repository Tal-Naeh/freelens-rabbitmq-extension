import { Renderer } from "@freelensapp/extensions";
import { useMemo } from "react";
import { RABBITMQ_LIVE_REFRESH_MS } from "../../common/constants";
import { ConnectionErrorPanel } from "../components/connection-error";
import {
  EmptyState,
  LoadingState,
  MetricStrip,
  PageShell,
  SearchBox,
  StatusDot,
  TargetSelector,
  Toolbar,
  WriteModeToggle,
} from "../components/page-shell";
import { type ColumnSpec, useResizableColumns } from "../components/resizable-columns";
import { formatBytesRate, formatNumber, formatRate, formatTimestamp, matchesQuery, shortNodeName } from "../format";
import { useDebounced, usePageParam, useResource, useSelectionParam } from "../hooks";
import { RABBITMQ_PAGE_IDS } from "../navigation";
import { useWriteMode } from "../write-mode-store";
import { ConsumersTable } from "./consumers-table";
import { useTargetPage } from "./page-deps";

import type { ChannelDto, ConnectionDto } from "../../common/ipc";
import type { Metric } from "../components/page-shell";
import type { PageDeps, Param } from "./page-deps";

export interface ConnectionsPageProps extends PageDeps {
  params?: { target: Param; query: Param; view: Param };
}

type View = "connections" | "channels" | "consumers";
const VIEWS: { value: View; label: string }[] = [
  { value: "connections", label: "Connections" },
  { value: "channels", label: "Channels" },
  { value: "consumers", label: "Consumers" },
];

const RABBITMQ_CONNECTIONS_COLUMNS: ColumnSpec[] = [
  { id: "name", width: 280, grow: true, minWidth: 140 },
  { id: "client", width: 160 },
  { id: "user", width: 110 },
  { id: "vhost", width: 80 },
  { id: "state", width: 110 },
  { id: "protocol", width: 130 },
  { id: "channels", width: 90, numeric: true },
  { id: "recv", width: 110, numeric: true },
  { id: "send", width: 110, numeric: true },
  { id: "since", width: 170 },
];

function ConnectionsTable({ items }: { items: ConnectionDto[] }) {
  const col = useResizableColumns("rabbitmq-connections", RABBITMQ_CONNECTIONS_COLUMNS);
  return (
    <Renderer.Component.Table<ConnectionDto>
      tableId="rabbitmq-connections"
      autoSize={false}
      scrollable
      sortSyncWithUrl={false}
      sortByDefault={{ sortBy: "name", orderBy: "asc" }}
      sortable={{
        name: (c) => c.clientProperties.connectionName ?? c.name,
        user: (c) => c.user,
        vhost: (c) => c.vhost,
        state: (c) => c.state,
        channels: (c) => c.channels,
        recv: (c) => c.recvBytes.rate ?? 0,
        send: (c) => c.sendBytes.rate ?? 0,
        since: (c) => c.connectedAt ?? 0,
      }}
    >
      <Renderer.Component.TableHead sticky nowrap>
        <Renderer.Component.TableCell {...col.head("name")} sortBy="name">
          Connection
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("client")}>Client</Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("user")} sortBy="user">
          User
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("vhost")} sortBy="vhost">
          Vhost
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("state")} sortBy="state">
          State
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("protocol")}>Protocol</Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("channels")} sortBy="channels">
          Channels
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("recv")} sortBy="recv">
          From client
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("send")} sortBy="send">
          To client
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("since")} sortBy="since">
          Connected
        </Renderer.Component.TableCell>
      </Renderer.Component.TableHead>
      {items.map((c) => (
        <Renderer.Component.TableRow key={c.name} sortItem={c} nowrap>
          <Renderer.Component.TableCell {...col.cell("name")} title={c.name}>
            <span className="RmqMono RmqEllipsis">{c.clientProperties.connectionName ?? c.name}</span>
            {c.clientProperties.connectionName ? <span className="RmqMuted RmqEllipsis RmqMono">{c.name}</span> : null}
            {c.node ? <span className="RmqMuted"> {shortNodeName(c.node)}</span> : null}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("client")} title={c.clientProperties.platform}>
            {[c.clientProperties.product, c.clientProperties.version].filter(Boolean).join(" ") || "—"}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("user")}>{c.user}</Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("vhost")}>
            <span className="RmqMono">{c.vhost}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("state")}>
            <StatusDot state={c.state} />
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("protocol")}>
            {c.protocol}
            {c.ssl ? <Renderer.Component.Badge small label="TLS" tooltip={c.sslProtocol} /> : null}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("channels")}>
            {formatNumber(c.channels)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("recv")}>
            {formatBytesRate(c.recvBytes.rate)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("send")}>
            {formatBytesRate(c.sendBytes.rate)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("since")}>
            {formatTimestamp(c.connectedAt)}
          </Renderer.Component.TableCell>
        </Renderer.Component.TableRow>
      ))}
    </Renderer.Component.Table>
  );
}

const RABBITMQ_CHANNELS_COLUMNS: ColumnSpec[] = [
  { id: "name", width: 280, grow: true, minWidth: 140 },
  { id: "user", width: 110 },
  { id: "vhost", width: 80 },
  { id: "state", width: 110 },
  { id: "mode", width: 110 },
  { id: "consumers", width: 100, numeric: true },
  { id: "prefetch", width: 110, numeric: true },
  { id: "unacked", width: 90, numeric: true },
  { id: "unconfirmed", width: 110, numeric: true },
  { id: "publish", width: 100, numeric: true },
  { id: "deliver", width: 100, numeric: true },
];

function ChannelsTable({ items }: { items: ChannelDto[] }) {
  const col = useResizableColumns("rabbitmq-channels", RABBITMQ_CHANNELS_COLUMNS);
  return (
    <Renderer.Component.Table<ChannelDto>
      tableId="rabbitmq-channels"
      autoSize={false}
      scrollable
      sortSyncWithUrl={false}
      sortByDefault={{ sortBy: "name", orderBy: "asc" }}
      sortable={{
        name: (c) => c.name,
        user: (c) => c.user,
        state: (c) => c.state,
        consumers: (c) => c.consumerCount,
        prefetch: (c) => c.prefetchCount,
        unacked: (c) => c.messagesUnacknowledged,
        publish: (c) => c.publish.rate ?? 0,
        deliver: (c) => c.deliverGet.rate ?? 0,
      }}
    >
      <Renderer.Component.TableHead sticky nowrap>
        <Renderer.Component.TableCell {...col.head("name")} sortBy="name">
          Channel
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("user")} sortBy="user">
          User
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("vhost")}>Vhost</Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("state")} sortBy="state">
          State
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("mode")}>Mode</Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("consumers")} sortBy="consumers">
          Consumers
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("prefetch")} sortBy="prefetch">
          Prefetch
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("unacked")} sortBy="unacked">
          Unacked
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("unconfirmed")}>Unconfirmed</Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("publish")} sortBy="publish">
          Publish
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("deliver")} sortBy="deliver">
          Deliver
        </Renderer.Component.TableCell>
      </Renderer.Component.TableHead>
      {items.map((c) => (
        <Renderer.Component.TableRow key={c.name} sortItem={c} nowrap>
          <Renderer.Component.TableCell {...col.cell("name")} title={c.name}>
            <span className="RmqMono RmqEllipsis">{c.name}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("user")}>{c.user}</Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("vhost")}>
            <span className="RmqMono">{c.vhost}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("state")}>
            <StatusDot state={c.state} />
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("mode")}>
            <span className="RmqBadges">
              {c.confirm ? <Renderer.Component.Badge small label="confirm" /> : null}
              {c.transactional ? <Renderer.Component.Badge small label="tx" /> : null}
            </span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("consumers")}>
            {formatNumber(c.consumerCount)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("prefetch")} title={`global prefetch ${c.globalPrefetchCount}`}>
            {c.prefetchCount === 0 ? "∞" : formatNumber(c.prefetchCount)}
            {c.globalPrefetchCount > 0 ? (
              <span className="RmqMuted"> / {formatNumber(c.globalPrefetchCount)}</span>
            ) : null}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("unacked")}>
            {formatNumber(c.messagesUnacknowledged)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("unconfirmed")}>
            {formatNumber(c.messagesUnconfirmed)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("publish")}>
            {formatRate(c.publish.rate)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("deliver")}>
            {formatRate(c.deliverGet.rate)}
          </Renderer.Component.TableCell>
        </Renderer.Component.TableRow>
      ))}
    </Renderer.Component.Table>
  );
}

export function ConnectionsPage(props: ConnectionsPageProps) {
  const page = useTargetPage(props, props.params?.target);
  const { target, selection } = page;
  const writeMode = useWriteMode(props.writeMode, target?.targetId);
  const [query, setQuery] = usePageParam(props.params?.query);
  const [rawView, setView] = useSelectionParam("connections.view", props.params?.view);
  const view = (VIEWS.some((v) => v.value === rawView) ? rawView : "connections") as View;
  const debouncedQuery = useDebounced(query);
  const scope = target ? `${page.clusterKey}:${target.targetId}` : undefined;

  const connections = useResource(
    scope ? `connections:${scope}` : undefined,
    () => props.client.connections(page.request()),
    {
      refreshMs: RABBITMQ_LIVE_REFRESH_MS,
      enabled: view === "connections",
    },
  );
  const channels = useResource(scope ? `channels:${scope}` : undefined, () => props.client.channels(page.request()), {
    refreshMs: RABBITMQ_LIVE_REFRESH_MS,
    enabled: view === "channels",
  });
  const consumers = useResource(
    scope ? `consumers:${scope}` : undefined,
    () => props.client.consumers(page.request()),
    {
      refreshMs: RABBITMQ_LIVE_REFRESH_MS,
      enabled: view === "consumers",
    },
  );
  const active = view === "connections" ? connections : view === "channels" ? channels : consumers;

  const filteredConnections = useMemo(
    () =>
      (connections.data?.items ?? []).filter((c) =>
        matchesQuery(
          debouncedQuery,
          c.name,
          c.clientProperties.connectionName,
          c.clientProperties.product,
          c.user,
          c.vhost,
          c.peerHost,
          c.state,
        ),
      ),
    [connections.data, debouncedQuery],
  );
  const filteredChannels = useMemo(
    () =>
      (channels.data?.items ?? []).filter((c) =>
        matchesQuery(debouncedQuery, c.name, c.connectionName, c.user, c.vhost, c.state),
      ),
    [channels.data, debouncedQuery],
  );
  const filteredConsumers = useMemo(
    () =>
      (consumers.data?.items ?? []).filter((c) =>
        matchesQuery(debouncedQuery, c.queue, c.consumerTag, c.connectionName, c.user, c.peerHost),
      ),
    [consumers.data, debouncedQuery],
  );

  const metrics: Metric[] = useMemo(() => {
    if (view === "connections") {
      const items = filteredConnections;
      return [
        { label: "Connections", value: formatNumber(items.length) },
        {
          label: "Blocked",
          value: formatNumber(items.filter((c) => /block/.test(c.state)).length),
          tone: items.some((c) => /block/.test(c.state)) ? "error" : undefined,
        },
        { label: "Channels", value: formatNumber(items.reduce((s, c) => s + c.channels, 0)) },
        { label: "TLS", value: formatNumber(items.filter((c) => c.ssl).length) },
        { label: "Inbound", value: formatBytesRate(items.reduce((s, c) => s + (c.recvBytes.rate ?? 0), 0)) },
        { label: "Outbound", value: formatBytesRate(items.reduce((s, c) => s + (c.sendBytes.rate ?? 0), 0)) },
      ];
    }
    if (view === "channels") {
      const items = filteredChannels;
      const noPrefetch = items.filter(
        (c) => c.consumerCount > 0 && c.prefetchCount === 0 && c.globalPrefetchCount === 0,
      ).length;
      return [
        { label: "Channels", value: formatNumber(items.length) },
        { label: "Consumers", value: formatNumber(items.reduce((s, c) => s + c.consumerCount, 0)) },
        { label: "Unacked", value: formatNumber(items.reduce((s, c) => s + c.messagesUnacknowledged, 0)) },
        {
          label: "No prefetch limit",
          value: formatNumber(noPrefetch),
          tone: noPrefetch > 0 ? "warning" : undefined,
          title: "Consuming channels without a prefetch (QoS) limit",
        },
        {
          label: "Flow-controlled",
          value: formatNumber(items.filter((c) => c.state === "flow").length),
          tone: items.some((c) => c.state === "flow") ? "warning" : undefined,
        },
      ];
    }
    const items = filteredConsumers;
    return [
      { label: "Consumers", value: formatNumber(items.length) },
      { label: "Queues consumed", value: formatNumber(new Set(items.map((c) => `${c.vhost}/${c.queue}`)).size) },
      {
        label: "Auto-ack",
        value: formatNumber(items.filter((c) => !c.ackRequired).length),
        tone: items.some((c) => !c.ackRequired) ? "warning" : undefined,
      },
      { label: "Inactive", value: formatNumber(items.filter((c) => !c.active).length) },
    ];
  }, [view, filteredConnections, filteredChannels, filteredConsumers]);

  const openQueue = (vh: string, queue: string) =>
    props.navigate(RABBITMQ_PAGE_IDS.queues, {
      target: target?.targetId ?? "",
      queue: `${encodeURIComponent(vh)}/${encodeURIComponent(queue)}`,
      view: "consumers",
    });

  const count =
    view === "connections"
      ? filteredConnections.length
      : view === "channels"
        ? filteredChannels.length
        : filteredConsumers.length;
  const total = active.data?.totalCount;

  return (
    <PageShell
      title="Connections & channels"
      subtitle={
        target
          ? `${target.namespace}/${target.name} · live, refreshes every ${RABBITMQ_LIVE_REFRESH_MS / 1000}s`
          : "Select a RabbitMQ cluster"
      }
      actions={
        <>
          <TargetSelector
            targets={selection.targets}
            selected={target}
            onChange={selection.select}
            disabled={selection.discovery.loading}
          />
          <WriteModeToggle store={props.writeMode} target={target} enabled={writeMode} />
          <Renderer.Component.Button plain label="Refresh" onClick={active.reload} disabled={active.loading} />
        </>
      }
    >
      <Renderer.Component.Tabs<View> className="RmqTabs" value={view} onChange={(v) => setView(v)} withBorder>
        {VIEWS.map((v) => (
          <Renderer.Component.Tab key={v.value} value={v.value} label={v.label} />
        ))}
      </Renderer.Component.Tabs>
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder={`Filter ${view}…`} />
        <span className="RmqToolbarRight">
          {count}
          {total !== undefined ? ` of ${total}` : ""} {view}
          {active.data?.truncated ? " · list truncated" : ""}
        </span>
      </Toolbar>
      {active.data ? <MetricStrip ariaLabel={`${view} summary`} metrics={metrics} /> : null}
      {active.error ? (
        <ConnectionErrorPanel
          error={active.error}
          target={target}
          client={props.client}
          clusterId={props.kubernetesClusterId}
          onRetry={active.reload}
        />
      ) : null}
      {active.loading && !active.data ? <LoadingState label={`Loading ${view}…`} /> : null}
      {active.data && count === 0 ? <EmptyState icon="power_off" title={`No ${view}`} /> : null}
      {count > 0 ? (
        <div className="RmqTableWrap">
          {view === "connections" ? <ConnectionsTable items={filteredConnections} /> : null}
          {view === "channels" ? <ChannelsTable items={filteredChannels} /> : null}
          {view === "consumers" ? (
            <ConsumersTable
              consumers={filteredConsumers}
              tableId="rabbitmq-consumers"
              showQueue
              onOpenQueue={openQueue}
            />
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}
