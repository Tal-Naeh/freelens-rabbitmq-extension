import { Renderer } from "@freelensapp/extensions";
import { useState } from "react";
import { parseIpcError } from "../../common/errors";
import { ConnectionErrorPanel } from "../components/connection-error";
import { ArgumentsView, KeyValueList, LoadingState, StatusDot } from "../components/page-shell";
import { formatBytes, formatNumber, formatRate, shortNodeName } from "../format";
import { useDeferredOpen, useResource } from "../hooks";
import { BindingsTable } from "./bindings-table";
import { ConsumersTable } from "./consumers-table";
import { MessageInspector } from "./message-inspector";

import type { QueueDetailDto, QueueSummaryDto } from "../../common/ipc";
import type { PageDeps, TargetPage } from "./page-deps";

type View = "overview" | "bindings" | "consumers" | "messages";
const VIEWS: { value: View; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "bindings", label: "Bindings" },
  { value: "consumers", label: "Consumers" },
  { value: "messages", label: "Messages" },
];

function QueueFacts({ detail }: { detail: QueueDetailDto }) {
  const q = detail.queue;
  return (
    <div className="RmqGrid2">
      <section className="RmqPanel">
        <h3>Definition</h3>
        <KeyValueList
          entries={[
            ["Type", q.type],
            ["State", <StatusDot state={q.state} />],
            ["Virtual host", <span className="RmqMono">{q.vhost}</span>],
            ["Node", <span className="RmqMono">{shortNodeName(q.node)}</span>],
            ["Policy", q.policy ?? "—"],
            [
              "Features",
              [q.durable && "durable", q.autoDelete && "auto-delete", q.exclusive && "exclusive"]
                .filter(Boolean)
                .join(", ") || "none",
            ],
            ["Arguments", <ArgumentsView args={q.arguments} />],
            [
              "Effective policy",
              detail.effectivePolicyDefinition ? <ArgumentsView args={detail.effectivePolicyDefinition} /> : "—",
            ],
          ]}
        />
      </section>
      <section className="RmqPanel">
        <h3>Messages & resources</h3>
        <KeyValueList
          entries={[
            ["Total", formatNumber(q.messages)],
            ["Ready", formatNumber(q.ready)],
            ["Unacknowledged", formatNumber(q.unacknowledged)],
            ["Persistent", formatNumber(detail.messagesPersistent)],
            ["In RAM", formatNumber(detail.messagesRam)],
            ["Head message age", detail.headMessageTimestamp ?? "—"],
            ["Message bytes", `${formatBytes(q.messageBytes)} (${formatBytes(q.messageBytesPersistent)} persistent)`],
            ["Process memory", formatBytes(q.memory)],
            [
              "Consumers",
              `${formatNumber(q.consumers)} (utilisation ${q.consumerUtilisation !== undefined ? `${Math.round(q.consumerUtilisation * 100)}%` : "—"})`,
            ],
            ["Publish", formatRate(q.publish.rate)],
            ["Deliver / Get", formatRate(q.deliverGet.rate)],
            ["Ack", formatRate(q.ack.rate)],
            ["Redeliver", formatRate(q.redeliver.rate)],
            ["Idle since", q.idleSince ?? "—"],
          ]}
        />
      </section>
    </div>
  );
}

export function QueueDetailDrawer({
  deps,
  page,
  queue,
  view,
  onViewChange,
  onClose,
  writeMode,
  onOpenExchange,
  onChanged,
}: {
  deps: PageDeps;
  page: TargetPage;
  queue: Pick<QueueSummaryDto, "vhost" | "name"> | undefined;
  view: View;
  onViewChange: (view: View) => void;
  onClose: () => void;
  writeMode: boolean;
  onOpenExchange: (vhost: string, exchange: string) => void;
  onChanged: () => void;
}) {
  const key =
    queue && page.target ? `queue:${page.clusterKey}:${page.target.targetId}:${queue.vhost}:${queue.name}` : undefined;
  const detail = useResource(key, () =>
    deps.client.queueDetail(page.request({ vhost: queue!.vhost, queue: queue!.name })),
  );
  const isOpen = useDeferredOpen(Boolean(queue));
  const [busy, setBusy] = useState(false);

  const guarded = (label: string, message: string, action: () => Promise<unknown>, afterClose = false) => {
    if (!queue) return;
    Renderer.Component.ConfirmDialog.open({
      labelOk: label,
      message: (
        <div className="RmqConfirm">
          <p>
            <strong>
              {label}: {queue.vhost}/{queue.name}
            </strong>
          </p>
          <p>{message}</p>
        </div>
      ),
      ok: async () => {
        setBusy(true);
        try {
          await action();
          Renderer.Component.Notifications.ok(`${label} succeeded for ${queue.name}`);
          onChanged();
          if (afterClose) onClose();
          else detail.reload();
        } catch (err) {
          Renderer.Component.Notifications.error(`${label} failed: ${parseIpcError(err).message}`);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const purge = () =>
    guarded("Purge queue", "All READY messages will be permanently discarded. Unacknowledged messages are kept.", () =>
      deps.client.purgeQueue(page.request({ vhost: queue!.vhost, queue: queue!.name })),
    );
  const remove = () =>
    guarded(
      "Delete queue",
      "The queue, its bindings and every message in it will be destroyed. Consumers will be cancelled.",
      () => deps.client.deleteQueue(page.request({ vhost: queue!.vhost, queue: queue!.name })),
      true,
    );

  return (
    <Renderer.Component.Drawer
      open={isOpen}
      title={queue ? `Queue ${queue.name}` : ""}
      onClose={onClose}
      usePortal
      size="min(1000px, 70vw)"
      toolbar={
        queue ? (
          <div className="RmqDrawerToolbar">
            <Renderer.Component.Button plain label="Refresh" onClick={detail.reload} disabled={detail.loading} />
            <Renderer.Component.Button
              plain
              label="Purge"
              disabled={!writeMode || busy}
              tooltip={writeMode ? undefined : "Enable Write Mode to purge"}
              onClick={purge}
            />
            <Renderer.Component.Button
              accent
              label="Delete"
              disabled={!writeMode || busy}
              tooltip={writeMode ? undefined : "Enable Write Mode to delete"}
              onClick={remove}
            />
          </div>
        ) : undefined
      }
    >
      {queue ? (
        <div className="RmqDrawerBody">
          <Renderer.Component.Tabs<View> className="RmqTabs" value={view} onChange={onViewChange} withBorder>
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
          {detail.loading && !detail.data ? <LoadingState label="Loading queue…" /> : null}
          {detail.data ? (
            <>
              {view === "overview" ? <QueueFacts detail={detail.data} /> : null}
              {view === "bindings" ? (
                <BindingsTable
                  bindings={detail.data.bindings}
                  tableId="rabbitmq-queue-bindings"
                  emptyLabel="No bindings — only reachable through the default exchange"
                  onOpenExchange={onOpenExchange}
                />
              ) : null}
              {view === "consumers" ? (
                <ConsumersTable consumers={detail.data.consumers} tableId="rabbitmq-queue-consumers" />
              ) : null}
              {view === "messages" ? (
                <MessageInspector
                  queueMessages={detail.data.queue.messages}
                  peek={(count) =>
                    deps.client.messagesPeek(page.request({ vhost: queue.vhost, queue: queue.name, count }))
                  }
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Renderer.Component.Drawer>
  );
}

export type { View as QueueDetailView };
