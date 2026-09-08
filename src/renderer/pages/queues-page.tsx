import { Renderer } from "@freelensapp/extensions";
import { useCallback, useMemo } from "react";
import { RABBITMQ_LIVE_REFRESH_MS } from "../../common/constants";
import { ConnectionErrorPanel } from "../components/connection-error";
import {
  EmptyState,
  LoadingState,
  PageShell,
  SearchBox,
  StatusDot,
  TargetSelector,
  Toolbar,
  WriteModeToggle,
} from "../components/page-shell";
import { formatBytes, formatNumber, formatRate, matchesQuery } from "../format";
import { useDebounced, usePageParam, useResource } from "../hooks";
import { RABBITMQ_PAGE_IDS } from "../navigation";
import { useWriteMode } from "../write-mode-store";
import { useTargetPage } from "./page-deps";
import { QueueDetailDrawer, type QueueDetailView } from "./queue-detail";

import type { QueueSummaryDto } from "../../common/ipc";
import type { PageDeps, Param } from "./page-deps";

export interface QueuesPageProps extends PageDeps {
  params?: { target: Param; vhost: Param; query: Param; queue: Param; view: Param };
}

const ALL_VHOSTS = "*";

function encodeQueueRef(q: QueueSummaryDto): string {
  return `${encodeURIComponent(q.vhost)}/${encodeURIComponent(q.name)}`;
}
function decodeQueueRef(ref: string): { vhost: string; name: string } | undefined {
  if (!ref) return undefined;
  const at = ref.indexOf("/");
  if (at < 0) return undefined;
  return { vhost: decodeURIComponent(ref.slice(0, at)), name: decodeURIComponent(ref.slice(at + 1)) };
}

export function QueuesPage(props: QueuesPageProps) {
  const page = useTargetPage(props, props.params?.target);
  const { target, selection } = page;
  const writeMode = useWriteMode(props.writeMode, target?.targetId);
  const [query, setQuery] = usePageParam(props.params?.query);
  const [vhost, setVhost] = usePageParam(props.params?.vhost);
  const [queueRef, setQueueRef] = usePageParam(props.params?.queue);
  const [view, setView] = usePageParam(props.params?.view);
  const debouncedQuery = useDebounced(query);

  const queues = useResource(
    target ? `queues:${page.clusterKey}:${target.targetId}` : undefined,
    () => props.client.queues(page.request()),
    { refreshMs: RABBITMQ_LIVE_REFRESH_MS },
  );
  const items = queues.data?.items ?? [];
  const vhosts = useMemo(() => [...new Set(items.map((q) => q.vhost))].sort(), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (q) =>
          (!vhost || vhost === ALL_VHOSTS || q.vhost === vhost) &&
          matchesQuery(debouncedQuery, q.name, q.type, q.state, q.node, q.policy),
      ),
    [items, vhost, debouncedQuery],
  );
  const selectedQueue = useMemo(() => decodeQueueRef(queueRef), [queueRef]);
  const openQueue = useCallback((q: QueueSummaryDto) => setQueueRef(encodeQueueRef(q)), [setQueueRef]);
  const openExchange = (vh: string, exchange: string) =>
    props.navigate(RABBITMQ_PAGE_IDS.exchanges, {
      target: target?.targetId ?? "",
      exchange: `${encodeURIComponent(vh)}/${encodeURIComponent(exchange)}`,
    });

  const totals = filtered.reduce(
    (acc, q) => ({
      messages: acc.messages + q.messages,
      ready: acc.ready + q.ready,
      unacked: acc.unacked + q.unacknowledged,
    }),
    { messages: 0, ready: 0, unacked: 0 },
  );

  const vhostOptions: Renderer.Component.SelectOption<string>[] = [
    { value: ALL_VHOSTS, label: "All vhosts" },
    ...vhosts.map((v) => ({ value: v, label: v })),
  ];

  return (
    <PageShell
      title="Queues"
      subtitle={target ? `${target.namespace}/${target.name}` : "Select a RabbitMQ cluster"}
      actions={
        <>
          <TargetSelector
            targets={selection.targets}
            selected={target}
            onChange={selection.select}
            disabled={selection.discovery.loading}
          />
          <WriteModeToggle store={props.writeMode} target={target} enabled={writeMode} />
          <Renderer.Component.Button plain label="Refresh" onClick={queues.reload} disabled={queues.loading} />
        </>
      }
    >
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder="Filter queues by name, type, state, node, policy…" />
        <Renderer.Component.Select
          options={vhostOptions}
          value={vhost || ALL_VHOSTS}
          onChange={(o: Renderer.Component.SelectOption<string> | null) => setVhost(o?.value ?? ALL_VHOSTS)}
          themeName="lens"
          menuPosition="fixed"
        />
        <span className="RmqToolbarRight">
          {filtered.length} of {queues.data?.totalCount ?? items.length} queues · {formatNumber(totals.ready)} ready ·{" "}
          {formatNumber(totals.unacked)} unacked
          {queues.data?.truncated ? " · list truncated" : ""}
        </span>
      </Toolbar>

      {queues.error ? (
        <ConnectionErrorPanel
          error={queues.error}
          target={target}
          client={props.client}
          clusterId={props.kubernetesClusterId}
          onRetry={queues.reload}
        />
      ) : null}
      {queues.loading && !queues.data ? <LoadingState label="Loading queues…" /> : null}
      {queues.data && filtered.length === 0 ? (
        <EmptyState icon="inbox" title={items.length === 0 ? "No queues declared" : "No queues match the filter"} />
      ) : null}

      {filtered.length > 0 ? (
        <div className="RmqTableWrap">
          <Renderer.Component.Table<QueueSummaryDto>
            tableId="rabbitmq-queues"
            autoSize={false}
            scrollable
            sortSyncWithUrl={false}
            sortByDefault={{ sortBy: "name", orderBy: "asc" }}
            sortable={{
              name: (q) => q.name,
              vhost: (q) => q.vhost,
              type: (q) => q.type,
              state: (q) => q.state,
              ready: (q) => q.ready,
              unacked: (q) => q.unacknowledged,
              total: (q) => q.messages,
              consumers: (q) => q.consumers,
              publish: (q) => q.publish.rate ?? 0,
              deliver: (q) => q.deliverGet.rate ?? 0,
              memory: (q) => q.memory ?? 0,
            }}
          >
            <Renderer.Component.TableHead sticky nowrap>
              <Renderer.Component.TableCell sortBy="name">Name</Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="vhost">Vhost</Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="type">Type</Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="state">State</Renderer.Component.TableCell>
              <Renderer.Component.TableCell>Features</Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="ready" className="RmqNum">
                Ready
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="unacked" className="RmqNum">
                Unacked
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="total" className="RmqNum">
                Total
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="consumers" className="RmqNum">
                Consumers
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="publish" className="RmqNum">
                Publish
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="deliver" className="RmqNum">
                Deliver
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell sortBy="memory" className="RmqNum">
                Memory
              </Renderer.Component.TableCell>
            </Renderer.Component.TableHead>
            {filtered.map((q) => (
              <Renderer.Component.TableRow
                key={`${q.vhost}/${q.name}`}
                sortItem={q}
                nowrap
                className="clickable"
                onClick={() => openQueue(q)}
              >
                <Renderer.Component.TableCell title={q.name}>
                  <span className="RmqMono RmqEllipsis">{q.name}</span>
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell>
                  <span className="RmqMono">{q.vhost}</span>
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell>{q.type}</Renderer.Component.TableCell>
                <Renderer.Component.TableCell>
                  <StatusDot state={q.state} />
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell>
                  <span className="RmqBadges">
                    {q.durable ? <Renderer.Component.Badge small label="D" tooltip="Durable" /> : null}
                    {q.autoDelete ? <Renderer.Component.Badge small label="AD" tooltip="Auto-delete" /> : null}
                    {q.exclusive ? <Renderer.Component.Badge small label="Excl" tooltip="Exclusive" /> : null}
                    {q.policy ? <Renderer.Component.Badge small label={q.policy} tooltip="Policy" /> : null}
                    {q.arguments["x-dead-letter-exchange"] ? (
                      <Renderer.Component.Badge small label="DLX" tooltip="Dead-letter exchange configured" />
                    ) : null}
                  </span>
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell className="RmqNum">{formatNumber(q.ready)}</Renderer.Component.TableCell>
                <Renderer.Component.TableCell className="RmqNum">
                  {formatNumber(q.unacknowledged)}
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell className="RmqNum">
                  {formatNumber(q.messages)}
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell className="RmqNum">
                  {formatNumber(q.consumers)}
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell className="RmqNum">
                  {formatRate(q.publish.rate)}
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell className="RmqNum">
                  {formatRate(q.deliverGet.rate)}
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell className="RmqNum">{formatBytes(q.memory)}</Renderer.Component.TableCell>
              </Renderer.Component.TableRow>
            ))}
          </Renderer.Component.Table>
        </div>
      ) : null}

      <QueueDetailDrawer
        deps={props}
        page={page}
        queue={selectedQueue ? { vhost: selectedQueue.vhost, name: selectedQueue.name } : undefined}
        view={(view as QueueDetailView) || "overview"}
        onViewChange={(v) => setView(v)}
        onClose={() => setQueueRef("")}
        writeMode={writeMode}
        onOpenExchange={openExchange}
        onChanged={queues.reload}
      />
    </PageShell>
  );
}
