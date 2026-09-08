import { Renderer } from "@freelensapp/extensions";
import { EmptyState } from "../components/page-shell";
import { type ColumnSpec, useResizableColumns } from "../components/resizable-columns";
import { formatNumber, shortNodeName } from "../format";

import type { ConsumerDto } from "../../common/ipc";

const RABBITMQ_CONSUMERS_COLUMNS: ColumnSpec[] = [
  { id: "queue", width: 220 },
  { id: "tag", width: 220, grow: true, minWidth: 120 },
  { id: "channel", width: 240 },
  { id: "peer", width: 170 },
  { id: "user", width: 100 },
  { id: "prefetch", width: 90, numeric: true },
  { id: "flags", width: 190 },
];

export function ConsumersTable({
  consumers,
  tableId,
  showQueue,
  onOpenQueue,
}: {
  consumers: ConsumerDto[];
  tableId: string;
  showQueue?: boolean;
  onOpenQueue?: (vhost: string, queue: string) => void;
}) {
  const col = useResizableColumns("rabbitmq-consumers", RABBITMQ_CONSUMERS_COLUMNS);
  if (consumers.length === 0) return <EmptyState icon="person_off" title="No consumers" />;
  return (
    <Renderer.Component.Table<ConsumerDto>
      tableId={tableId}
      autoSize={false}
      scrollable={false}
      sortSyncWithUrl={false}
      sortByDefault={{ sortBy: "queue", orderBy: "asc" }}
      sortable={{
        queue: (c) => c.queue,
        tag: (c) => c.consumerTag,
        connection: (c) => c.connectionName ?? "",
        prefetch: (c) => c.prefetchCount,
      }}
    >
      <Renderer.Component.TableHead sticky={false} nowrap>
        {showQueue ? (
          <Renderer.Component.TableCell {...col.head("queue")} sortBy="queue">
            Queue
          </Renderer.Component.TableCell>
        ) : null}
        <Renderer.Component.TableCell {...col.head("tag")} sortBy="tag">
          Consumer tag
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("channel")} sortBy="connection">
          Channel / connection
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("peer")}>Peer</Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("user")}>User</Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("prefetch")} sortBy="prefetch">
          Prefetch
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("flags")}>Flags</Renderer.Component.TableCell>
      </Renderer.Component.TableHead>
      {consumers.map((c) => (
        <Renderer.Component.TableRow key={`${c.channelName}|${c.consumerTag}`} sortItem={c} nowrap>
          {showQueue ? (
            <Renderer.Component.TableCell {...col.cell("queue")}>
              {onOpenQueue ? (
                <span className="RmqLink RmqMono" onClick={() => onOpenQueue(c.vhost, c.queue)}>
                  {c.queue}
                </span>
              ) : (
                <span className="RmqMono">{c.queue}</span>
              )}
              {c.vhost !== "/" ? <span className="RmqMuted"> @ {c.vhost}</span> : null}
            </Renderer.Component.TableCell>
          ) : null}
          <Renderer.Component.TableCell {...col.cell("tag")} title={c.consumerTag}>
            <span className="RmqMono RmqEllipsis">{c.consumerTag}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("channel")} title={c.channelName}>
            <span className="RmqMono RmqEllipsis">{c.channelName ?? "—"}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("peer")}>
            {c.peerHost ? `${c.peerHost}:${c.peerPort ?? ""}` : "—"}
            {c.node ? <span className="RmqMuted"> · {shortNodeName(c.node)}</span> : null}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("user")}>{c.user ?? "—"}</Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("prefetch")}>
            {c.prefetchCount === 0 ? "∞" : formatNumber(c.prefetchCount)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("flags")}>
            <span className="RmqBadges">
              {c.ackRequired ? (
                <Renderer.Component.Badge small label="manual ack" />
              ) : (
                <Renderer.Component.Badge small label="auto-ack" className="warning" />
              )}
              {c.exclusive ? <Renderer.Component.Badge small label="exclusive" /> : null}
              {!c.active ? <Renderer.Component.Badge small label="inactive" className="warning" /> : null}
              {c.activityStatus && c.activityStatus !== "up" ? (
                <Renderer.Component.Badge small label={c.activityStatus} />
              ) : null}
            </span>
          </Renderer.Component.TableCell>
        </Renderer.Component.TableRow>
      ))}
    </Renderer.Component.Table>
  );
}
