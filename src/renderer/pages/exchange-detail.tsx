import { Renderer } from "@freelensapp/extensions";
import { useState } from "react";
import { parseIpcError } from "../../common/errors";
import { ConnectionErrorPanel } from "../components/connection-error";
import { ArgumentsView, KeyValueList, LoadingState } from "../components/page-shell";
import { formatRate } from "../format";
import { useResource } from "../hooks";
import { BindingsTable } from "./bindings-table";

import type { ExchangeDetailDto } from "../../common/ipc";
import type { PageDeps, TargetPage } from "./page-deps";

type View = "overview" | "bindings" | "publish";
const VIEWS: { value: View; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "bindings", label: "Bindings" },
  { value: "publish", label: "Publish" },
];

function PublishForm({
  deps,
  page,
  vhost,
  exchange,
  writeMode,
}: {
  deps: PageDeps;
  page: TargetPage;
  vhost: string;
  exchange: string;
  writeMode: boolean;
}) {
  const [routingKey, setRoutingKey] = useState("");
  const [payload, setPayload] = useState("");
  const [contentType, setContentType] = useState("application/json");
  const [persistent, setPersistent] = useState(true);
  const [busy, setBusy] = useState(false);

  const publish = () => {
    Renderer.Component.ConfirmDialog.open({
      labelOk: "Publish",
      message: (
        <div className="RmqConfirm">
          <p>
            <strong>
              Publish to exchange "{exchange || "(default)"}" in vhost {vhost}?
            </strong>
          </p>
          <p>
            Routing key: <code>{routingKey || "(empty)"}</code>, {payload.length} characters. This writes to the live
            broker.
          </p>
        </div>
      ),
      ok: async () => {
        setBusy(true);
        try {
          const properties: Record<string, unknown> = { delivery_mode: persistent ? 2 : 1 };
          if (contentType) properties.content_type = contentType;
          const result = await deps.client.publish(
            page.request({ vhost, exchange, routingKey, payload, payloadEncoding: "string" as const, properties }),
          );
          if (result.routed) Renderer.Component.Notifications.ok("Message published and routed to at least one queue");
          else
            Renderer.Component.Notifications.error(
              "Message published but NOT routed — no binding matched the routing key",
            );
        } catch (err) {
          Renderer.Component.Notifications.error(`Publish failed: ${parseIpcError(err).message}`);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <div className="RmqForm">
      {!writeMode ? (
        <div className="RmqNotice warning">
          <Renderer.Component.Icon material="lock" small />
          <p>
            Publishing is disabled. Enable <strong>Write Mode</strong> in the page header to unlock it.
          </p>
        </div>
      ) : null}
      <div className="RmqFormRow">
        <Renderer.Component.Input
          theme="round-black"
          placeholder="Routing key"
          value={routingKey}
          onChange={setRoutingKey}
          disabled={!writeMode}
        />
        <Renderer.Component.Input
          theme="round-black"
          placeholder="Content type (optional)"
          value={contentType}
          onChange={setContentType}
          disabled={!writeMode}
        />
      </div>
      <Renderer.Component.Input
        theme="round-black"
        multiLine
        maxRows={16}
        placeholder="Payload (text or JSON)"
        value={payload}
        onChange={setPayload}
        disabled={!writeMode}
      />
      <div className="RmqFormRow">
        <Renderer.Component.Checkbox
          label="Persistent (delivery_mode=2)"
          value={persistent}
          onChange={setPersistent}
          disabled={!writeMode}
        />
        <Renderer.Component.Button
          primary
          label={busy ? "Publishing…" : "Publish message"}
          disabled={!writeMode || busy || payload.length === 0}
          onClick={publish}
        />
      </div>
    </div>
  );
}

function ExchangeFacts({ detail }: { detail: ExchangeDetailDto }) {
  const x = detail.exchange;
  return (
    <div className="RmqGrid2">
      <section className="RmqPanel">
        <h3>Definition</h3>
        <KeyValueList
          entries={[
            ["Name", <span className="RmqMono">{x.name || "(default exchange)"}</span>],
            ["Type", x.type],
            ["Virtual host", <span className="RmqMono">{x.vhost}</span>],
            ["Policy", x.policy ?? "—"],
            [
              "Features",
              [x.durable && "durable", x.autoDelete && "auto-delete", x.internal && "internal"]
                .filter(Boolean)
                .join(", ") || "none",
            ],
            ["Arguments", <ArgumentsView args={x.arguments} />],
          ]}
        />
      </section>
      <section className="RmqPanel">
        <h3>Traffic</h3>
        <KeyValueList
          entries={[
            ["Publish in", formatRate(x.publishIn.rate)],
            ["Publish out", formatRate(x.publishOut.rate)],
            ["Outgoing bindings", String(detail.bindingsOut.length)],
            ["Incoming bindings (E2E)", String(detail.bindingsIn.length)],
          ]}
        />
      </section>
    </div>
  );
}

export function ExchangeDetailDrawer({
  deps,
  page,
  exchange,
  onClose,
  writeMode,
  onOpenQueue,
  onOpenExchange,
  onChanged,
}: {
  deps: PageDeps;
  page: TargetPage;
  exchange: { vhost: string; name: string } | undefined;
  onClose: () => void;
  writeMode: boolean;
  onOpenQueue: (vhost: string, queue: string) => void;
  onOpenExchange: (vhost: string, exchange: string) => void;
  onChanged: () => void;
}) {
  const [view, setView] = useState<View>("overview");
  const [busy, setBusy] = useState(false);
  const key =
    exchange && page.target
      ? `exchange:${page.clusterKey}:${page.target.targetId}:${exchange.vhost}:${exchange.name}`
      : undefined;
  const detail = useResource(key, () =>
    deps.client.exchangeDetail(page.request({ vhost: exchange!.vhost, exchange: exchange!.name })),
  );

  const remove = () => {
    if (!exchange) return;
    Renderer.Component.ConfirmDialog.open({
      labelOk: "Delete exchange",
      message: (
        <div className="RmqConfirm">
          <p>
            <strong>
              Delete exchange {exchange.vhost}/{exchange.name}?
            </strong>
          </p>
          <p>All bindings from this exchange are removed. Publishers using it will get channel errors.</p>
        </div>
      ),
      ok: async () => {
        setBusy(true);
        try {
          await deps.client.deleteExchange(page.request({ vhost: exchange.vhost, exchange: exchange.name }));
          Renderer.Component.Notifications.ok(`Exchange ${exchange.name} deleted`);
          onChanged();
          onClose();
        } catch (err) {
          Renderer.Component.Notifications.error(`Delete failed: ${parseIpcError(err).message}`);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  return (
    <Renderer.Component.Drawer
      open={Boolean(exchange)}
      title={exchange ? `Exchange ${exchange.name || "(default)"}` : ""}
      onClose={onClose}
      usePortal
      size="min(1000px, 70vw)"
      toolbar={
        exchange ? (
          <div className="RmqDrawerToolbar">
            <Renderer.Component.Button plain label="Refresh" onClick={detail.reload} disabled={detail.loading} />
            <Renderer.Component.Button
              accent
              label="Delete"
              disabled={!writeMode || busy || exchange.name === "" || exchange.name.startsWith("amq.")}
              tooltip={writeMode ? undefined : "Enable Write Mode to delete"}
              onClick={remove}
            />
          </div>
        ) : undefined
      }
    >
      {exchange ? (
        <div className="RmqDrawerBody">
          <Renderer.Component.Tabs<View> className="RmqTabs" value={view} onChange={setView} withBorder>
            {VIEWS.map((v) => (
              <Renderer.Component.Tab key={v.value} value={v.value} label={v.label} />
            ))}
          </Renderer.Component.Tabs>
          {detail.error ? (
            <ConnectionErrorPanel
              error={detail.error}
              target={page.target}
              client={deps.client}
              clusterId={deps.kubernetesClusterId}
              onRetry={detail.reload}
            />
          ) : null}
          {detail.loading && !detail.data ? <LoadingState label="Loading exchange…" /> : null}
          {detail.data && view === "overview" ? <ExchangeFacts detail={detail.data} /> : null}
          {detail.data && view === "bindings" ? (
            <>
              <h3>Outgoing (this exchange → destinations)</h3>
              <BindingsTable
                bindings={detail.data.bindingsOut}
                tableId="rabbitmq-exchange-bindings-out"
                emptyLabel="No outgoing bindings"
                onOpenQueue={onOpenQueue}
                onOpenExchange={onOpenExchange}
              />
              {detail.data.bindingsIn.length > 0 ? (
                <>
                  <h3>Incoming (exchange → this exchange)</h3>
                  <BindingsTable
                    bindings={detail.data.bindingsIn}
                    tableId="rabbitmq-exchange-bindings-in"
                    emptyLabel="No incoming bindings"
                    onOpenExchange={onOpenExchange}
                  />
                </>
              ) : null}
            </>
          ) : null}
          {view === "publish" ? (
            <PublishForm
              deps={deps}
              page={page}
              vhost={exchange.vhost}
              exchange={exchange.name}
              writeMode={writeMode}
            />
          ) : null}
        </div>
      ) : null}
    </Renderer.Component.Drawer>
  );
}
