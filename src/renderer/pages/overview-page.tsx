import { Renderer } from "@freelensapp/extensions";
import { RABBITMQ_LIVE_REFRESH_MS } from "../../common/constants";
import { ConnectionErrorPanel } from "../components/connection-error";
import {
  EmptyState,
  KeyValueList,
  LoadingState,
  MetricStrip,
  PageShell,
  StatusDot,
  TargetSelector,
  WriteModeToggle,
} from "../components/page-shell";
import { formatBytes, formatDuration, formatNumber, formatPercent, formatRate, shortNodeName } from "../format";
import { useResource } from "../hooks";
import { RABBITMQ_PAGE_IDS } from "../navigation";
import { useWriteMode } from "../write-mode-store";
import { useTargetPage } from "./page-deps";

import type { NodeDto } from "../../common/ipc";
import type { Metric } from "../components/page-shell";
import type { PageDeps, Param } from "./page-deps";

export interface OverviewPageProps extends PageDeps {
  params?: { target: Param };
}

function Bar({ used, total, alarm }: { used?: number; total?: number; alarm: boolean }) {
  if (used === undefined || total === undefined || total <= 0) return <span className="RmqMuted">—</span>;
  const pct = Math.min(100, Math.round((used / total) * 100));
  const tone = alarm || pct >= 90 ? "error" : pct >= 75 ? "warning" : "";
  return (
    <div className={`RmqBar ${tone}`.trim()} title={`${pct}%`}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

function NodesTable({ nodes }: { nodes: NodeDto[] }) {
  return (
    <Renderer.Component.Table<NodeDto>
      className="RmqNodesTable"
      tableId="rabbitmq-nodes"
      autoSize={false}
      scrollable={false}
      sortSyncWithUrl={false}
      sortByDefault={{ sortBy: "name", orderBy: "asc" }}
      sortable={{ name: (n) => n.name }}
    >
      <Renderer.Component.TableHead sticky={false} nowrap>
        <Renderer.Component.TableCell sortBy="name">Node</Renderer.Component.TableCell>
        <Renderer.Component.TableCell>State</Renderer.Component.TableCell>
        <Renderer.Component.TableCell>Uptime</Renderer.Component.TableCell>
        <Renderer.Component.TableCell>Memory</Renderer.Component.TableCell>
        <Renderer.Component.TableCell>Disk free</Renderer.Component.TableCell>
        <Renderer.Component.TableCell>File descriptors</Renderer.Component.TableCell>
        <Renderer.Component.TableCell>Sockets</Renderer.Component.TableCell>
        <Renderer.Component.TableCell>Erlang processes</Renderer.Component.TableCell>
      </Renderer.Component.TableHead>
      {nodes.map((n) => {
        const diskLow = n.diskFree !== undefined && n.diskFreeLimit !== undefined && n.diskFree < n.diskFreeLimit * 2;
        return (
          <Renderer.Component.TableRow key={n.name} sortItem={n} nowrap>
            <Renderer.Component.TableCell title={n.name}>
              <span className="RmqMono">{shortNodeName(n.name)}</span>
              {n.partitions.length > 0 ? (
                <Renderer.Component.Badge small label="PARTITIONED" className="error" />
              ) : null}
            </Renderer.Component.TableCell>
            <Renderer.Component.TableCell>
              <StatusDot state={n.running ? "running" : "down"} />
              {n.memAlarm ? <Renderer.Component.Badge small label="mem alarm" className="error" /> : null}
              {n.diskFreeAlarm ? <Renderer.Component.Badge small label="disk alarm" className="error" /> : null}
            </Renderer.Component.TableCell>
            <Renderer.Component.TableCell>{formatDuration(n.uptimeMs)}</Renderer.Component.TableCell>
            <Renderer.Component.TableCell
              title={`${formatBytes(n.memUsed)} of ${formatBytes(n.memLimit)} high-watermark`}
            >
              <div>
                {formatBytes(n.memUsed)} / {formatBytes(n.memLimit)}
              </div>
              <Bar used={n.memUsed} total={n.memLimit} alarm={n.memAlarm} />
            </Renderer.Component.TableCell>
            <Renderer.Component.TableCell title={`limit ${formatBytes(n.diskFreeLimit)}`}>
              <span className={diskLow || n.diskFreeAlarm ? "RmqState error" : ""}>{formatBytes(n.diskFree)}</span>
            </Renderer.Component.TableCell>
            <Renderer.Component.TableCell>
              {formatNumber(n.fdUsed)} / {formatNumber(n.fdTotal)} ({formatPercent(n.fdUsed, n.fdTotal)})
            </Renderer.Component.TableCell>
            <Renderer.Component.TableCell>
              {formatNumber(n.socketsUsed)} / {formatNumber(n.socketsTotal)}
            </Renderer.Component.TableCell>
            <Renderer.Component.TableCell>
              {formatNumber(n.procUsed)} / {formatNumber(n.procTotal)}
            </Renderer.Component.TableCell>
          </Renderer.Component.TableRow>
        );
      })}
    </Renderer.Component.Table>
  );
}

export function OverviewPage(props: OverviewPageProps) {
  const page = useTargetPage(props, props.params?.target);
  const { target, selection } = page;
  const writeMode = useWriteMode(props.writeMode, target?.targetId);
  const overview = useResource(
    target ? `overview:${page.clusterKey}:${target.targetId}` : undefined,
    () => props.client.overview(page.request()),
    { refreshMs: RABBITMQ_LIVE_REFRESH_MS },
  );
  const data = overview.data;

  const totals: Metric[] = data
    ? [
        { label: "Queues", value: formatNumber(data.totals.queues) },
        { label: "Exchanges", value: formatNumber(data.totals.exchanges) },
        { label: "Connections", value: formatNumber(data.totals.connections) },
        { label: "Channels", value: formatNumber(data.totals.channels) },
        { label: "Consumers", value: formatNumber(data.totals.consumers) },
        {
          label: "Ready",
          value: formatNumber(data.queueTotals.ready),
          tone: data.queueTotals.ready > 0 ? "warning" : undefined,
        },
        { label: "Unacked", value: formatNumber(data.queueTotals.unacknowledged) },
      ]
    : [];
  const rates: Metric[] = data
    ? [
        { label: "Publish", value: formatRate(data.rates.publish.rate) },
        { label: "Deliver / Get", value: formatRate(data.rates.deliverGet.rate) },
        { label: "Ack", value: formatRate(data.rates.ack.rate) },
        {
          label: "Redeliver",
          value: formatRate(data.rates.redeliver.rate),
          tone: (data.rates.redeliver.rate ?? 0) > 0 ? "warning" : undefined,
        },
        { label: "Confirm", value: formatRate(data.rates.confirm.rate) },
        {
          label: "Unroutable",
          value: formatRate(data.rates.returnUnroutable.rate),
          tone: (data.rates.returnUnroutable.rate ?? 0) > 0 ? "error" : undefined,
        },
      ]
    : [];

  return (
    <PageShell
      title="Overview"
      subtitle={target ? `${target.provider} · ${target.namespace}/${target.name}` : "Select a RabbitMQ cluster"}
      actions={
        <>
          <TargetSelector
            targets={selection.targets}
            selected={target}
            onChange={selection.select}
            disabled={selection.discovery.loading}
          />
          <WriteModeToggle store={props.writeMode} target={target} enabled={writeMode} />
          <Renderer.Component.Button plain label="Refresh" onClick={overview.reload} disabled={overview.loading} />
        </>
      }
    >
      {!target && !selection.discovery.loading ? (
        <EmptyState icon="search_off" title="No RabbitMQ cluster selected">
          <Renderer.Component.Button
            plain
            label="Go to Clusters"
            onClick={() => props.navigate(RABBITMQ_PAGE_IDS.clusters)}
          />
        </EmptyState>
      ) : null}
      {overview.error ? (
        <ConnectionErrorPanel
          error={overview.error}
          target={target}
          client={props.client}
          clusterId={props.kubernetesClusterId}
          onRetry={overview.reload}
        />
      ) : null}
      {overview.loading && !data ? (
        <LoadingState label="Connecting to the Management API through a port-forward…" />
      ) : null}

      {data ? (
        <>
          <MetricStrip ariaLabel="Object totals" metrics={totals} />
          <MetricStrip ariaLabel="Message rates" metrics={rates} />
          <div className="RmqGrid2">
            <section className="RmqPanel">
              <h3>Cluster</h3>
              <KeyValueList
                entries={[
                  ["Cluster name", <span className="RmqMono">{data.clusterName}</span>],
                  ["RabbitMQ", data.rabbitmqVersion],
                  ["Erlang", data.erlangVersion],
                  ["Management plugin", data.managementVersion ?? "—"],
                  ["Answering node", <span className="RmqMono">{shortNodeName(data.node)}</span>],
                  ["Virtual hosts", data.vhosts.join(", ") || "—"],
                ]}
              />
            </section>
            <section className="RmqPanel">
              <h3>Session</h3>
              <KeyValueList
                entries={[
                  [
                    "Port-forward",
                    <span className="RmqMono">
                      {data.session.localAddress} → {data.session.pod}
                    </span>,
                  ],
                  ["User", <span className="RmqMono">{data.session.username}</span>],
                  ["User tags", data.userTags.join(", ") || "none"],
                  ["Credential source", data.session.credentialSource],
                  ["Mode", writeMode ? "Write Mode (armed)" : "Read-only"],
                ]}
              />
            </section>
          </div>
          <section className="RmqPanel RmqTableWrap">
            <h3>Nodes</h3>
            <NodesTable nodes={data.nodes} />
          </section>
        </>
      ) : null}
    </PageShell>
  );
}
