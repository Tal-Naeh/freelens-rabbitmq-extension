import { Renderer } from "@freelensapp/extensions";
import { useMemo } from "react";
import { RABBITMQ_LIVE_REFRESH_MS } from "../../common/constants";
import { ConnectionErrorPanel } from "../components/connection-error";
import {
  EmptyState,
  LoadingState,
  PageShell,
  SearchBox,
  TargetSelector,
  Toolbar,
  WriteModeToggle,
} from "../components/page-shell";
import { type ColumnSpec, useResizableColumns } from "../components/resizable-columns";
import { formatRate, matchesQuery } from "../format";
import { useDebounced, usePageParam, useResource, useSelectionParam } from "../hooks";
import { RABBITMQ_PAGE_IDS } from "../navigation";
import { useWriteMode } from "../write-mode-store";
import { ExchangeDetailDrawer } from "./exchange-detail";
import { useTargetPage } from "./page-deps";

import type { ExchangeSummaryDto } from "../../common/ipc";
import type { PageDeps, Param } from "./page-deps";

export interface ExchangesPageProps extends PageDeps {
  params?: { target: Param; vhost: Param; query: Param; exchange: Param };
}

const ALL_VHOSTS = "*";

function decodeRef(ref: string): { vhost: string; name: string } | undefined {
  if (!ref) return undefined;
  const at = ref.indexOf("/");
  if (at < 0) return undefined;
  return { vhost: decodeURIComponent(ref.slice(0, at)), name: decodeURIComponent(ref.slice(at + 1)) };
}

const RABBITMQ_EXCHANGES_COLUMNS: ColumnSpec[] = [
  { id: "name", width: 300, grow: true, minWidth: 140 },
  { id: "vhost", width: 80 },
  { id: "type", width: 110 },
  { id: "features", width: 170 },
  { id: "in", width: 120, numeric: true },
  { id: "out", width: 120, numeric: true },
];

export function ExchangesPage(props: ExchangesPageProps) {
  const col = useResizableColumns("rabbitmq-exchanges", RABBITMQ_EXCHANGES_COLUMNS);
  const page = useTargetPage(props, props.params?.target);
  const { target, selection } = page;
  const writeMode = useWriteMode(props.writeMode, target?.targetId);
  const [query, setQuery] = usePageParam(props.params?.query);
  const [vhost, setVhost] = usePageParam(props.params?.vhost);
  const [exchangeRef, setExchangeRef] = useSelectionParam(props.params?.exchange);
  const debouncedQuery = useDebounced(query);

  const exchanges = useResource(
    target ? `exchanges:${page.clusterKey}:${target.targetId}` : undefined,
    () => props.client.exchanges(page.request()),
    { refreshMs: RABBITMQ_LIVE_REFRESH_MS * 2 },
  );
  const items = exchanges.data?.items ?? [];
  const vhosts = useMemo(() => [...new Set(items.map((x) => x.vhost))].sort(), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (x) =>
          (!vhost || vhost === ALL_VHOSTS || x.vhost === vhost) &&
          matchesQuery(debouncedQuery, x.name, x.type, x.policy),
      ),
    [items, vhost, debouncedQuery],
  );
  const selected = useMemo(() => decodeRef(exchangeRef), [exchangeRef]);
  const openExchange = (vh: string, name: string) =>
    setExchangeRef(`${encodeURIComponent(vh)}/${encodeURIComponent(name)}`);
  const openQueue = (vh: string, queue: string) =>
    props.navigate(RABBITMQ_PAGE_IDS.queues, {
      target: target?.targetId ?? "",
      queue: `${encodeURIComponent(vh)}/${encodeURIComponent(queue)}`,
      view: "overview",
    });

  const vhostOptions: Renderer.Component.SelectOption<string>[] = [
    { value: ALL_VHOSTS, label: "All vhosts" },
    ...vhosts.map((v) => ({ value: v, label: v })),
  ];

  return (
    <PageShell
      title="Exchanges"
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
          <Renderer.Component.Button plain label="Refresh" onClick={exchanges.reload} disabled={exchanges.loading} />
        </>
      }
    >
      <Toolbar>
        <SearchBox value={query} onChange={setQuery} placeholder="Filter exchanges by name, type, policy…" />
        <Renderer.Component.Select
          options={vhostOptions}
          value={vhost || ALL_VHOSTS}
          onChange={(o: Renderer.Component.SelectOption<string> | null) => setVhost(o?.value ?? ALL_VHOSTS)}
          themeName="lens"
          menuPosition="fixed"
        />
        <span className="RmqToolbarRight">
          {filtered.length} of {exchanges.data?.totalCount ?? items.length} exchanges
          {exchanges.data?.truncated ? " · list truncated" : ""}
        </span>
      </Toolbar>

      {exchanges.error ? (
        <ConnectionErrorPanel
          error={exchanges.error}
          target={target}
          client={props.client}
          clusterId={props.kubernetesClusterId}
          onRetry={exchanges.reload}
        />
      ) : null}
      {exchanges.loading && !exchanges.data ? <LoadingState label="Loading exchanges…" /> : null}
      {exchanges.data && filtered.length === 0 ? (
        <EmptyState icon="alt_route" title="No exchanges match the filter" />
      ) : null}

      {filtered.length > 0 ? (
        <div className="RmqTableWrap">
          <Renderer.Component.Table<ExchangeSummaryDto>
            tableId="rabbitmq-exchanges"
            autoSize={false}
            scrollable
            sortSyncWithUrl={false}
            sortByDefault={{ sortBy: "name", orderBy: "asc" }}
            sortable={{
              name: (x) => x.name,
              vhost: (x) => x.vhost,
              type: (x) => x.type,
              in: (x) => x.publishIn.rate ?? 0,
              out: (x) => x.publishOut.rate ?? 0,
            }}
          >
            <Renderer.Component.TableHead sticky nowrap>
              <Renderer.Component.TableCell {...col.head("name")} sortBy="name">
                Name
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell {...col.head("vhost")} sortBy="vhost">
                Vhost
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell {...col.head("type")} sortBy="type">
                Type
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell {...col.head("features")}>Features</Renderer.Component.TableCell>
              <Renderer.Component.TableCell {...col.head("in")} sortBy="in">
                Publish in
              </Renderer.Component.TableCell>
              <Renderer.Component.TableCell {...col.head("out")} sortBy="out">
                Publish out
              </Renderer.Component.TableCell>
            </Renderer.Component.TableHead>
            {filtered.map((x) => (
              <Renderer.Component.TableRow
                key={`${x.vhost}/${x.name}`}
                sortItem={x}
                nowrap
                className="clickable"
                onClick={() => openExchange(x.vhost, x.name)}
              >
                <Renderer.Component.TableCell {...col.cell("name")} title={x.name}>
                  <span className="RmqMono RmqEllipsis">
                    {x.name || <span className="RmqMuted">(AMQP default)</span>}
                  </span>
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell {...col.cell("vhost")}>
                  <span className="RmqMono">{x.vhost}</span>
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell {...col.cell("type")}>{x.type}</Renderer.Component.TableCell>
                <Renderer.Component.TableCell {...col.cell("features")}>
                  <span className="RmqBadges">
                    {x.durable ? <Renderer.Component.Badge small label="D" tooltip="Durable" /> : null}
                    {x.autoDelete ? <Renderer.Component.Badge small label="AD" tooltip="Auto-delete" /> : null}
                    {x.internal ? <Renderer.Component.Badge small label="I" tooltip="Internal" /> : null}
                    {x.policy ? <Renderer.Component.Badge small label={x.policy} tooltip="Policy" /> : null}
                    {x.arguments["alternate-exchange"] ? (
                      <Renderer.Component.Badge small label="AE" tooltip="Alternate exchange" />
                    ) : null}
                  </span>
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell {...col.cell("in")}>
                  {formatRate(x.publishIn.rate)}
                </Renderer.Component.TableCell>
                <Renderer.Component.TableCell {...col.cell("out")}>
                  {formatRate(x.publishOut.rate)}
                </Renderer.Component.TableCell>
              </Renderer.Component.TableRow>
            ))}
          </Renderer.Component.Table>
        </div>
      ) : null}

      <ExchangeDetailDrawer
        deps={props}
        page={page}
        exchange={selected}
        onClose={() => setExchangeRef("")}
        writeMode={writeMode}
        onOpenQueue={openQueue}
        onOpenExchange={openExchange}
        onChanged={exchanges.reload}
      />
    </PageShell>
  );
}
