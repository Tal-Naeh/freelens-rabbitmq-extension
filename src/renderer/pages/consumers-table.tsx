import { Renderer } from "@freelensapp/extensions";
import { EmptyState } from "../components/page-shell";
import { formatNumber, shortNodeName } from "../format";

import type { ConsumerDto } from "../../common/ipc";

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
          <Renderer.Component.TableCell className="RmqColGrowS" sortBy="queue">
            Queue
          </Renderer.Component.TableCell>
        ) : null}
        <Renderer.Component.TableCell className="RmqColGrowS" sortBy="tag">
          Consumer tag
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell className="RmqColGrow" sortBy="connection">
          Channel / connection
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell className="RmqColL">Peer</Renderer.Component.TableCell>
        <Renderer.Component.TableCell className="RmqColM">User</Renderer.Component.TableCell>
        <Renderer.Component.TableCell sortBy="prefetch" className="RmqNum RmqColS">
          Prefetch
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell className="RmqColL">Flags</Renderer.Component.TableCell>
      </Renderer.Component.TableHead>
      {consumers.map((c) => (
        <Renderer.Component.TableRow key={`${c.channelName}|${c.consumerTag}`} sortItem={c} nowrap>
          {showQueue ? (
            <Renderer.Component.TableCell className="RmqColGrowS">
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
          <Renderer.Component.TableCell className="RmqColGrowS" title={c.consumerTag}>
            <span className="RmqMono RmqEllipsis">{c.consumerTag}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell className="RmqColGrow" title={c.channelName}>
            <span className="RmqMono RmqEllipsis">{c.channelName ?? "—"}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell className="RmqColL">
            {c.peerHost ? `${c.peerHost}:${c.peerPort ?? ""}` : "—"}
            {c.node ? <span className="RmqMuted"> · {shortNodeName(c.node)}</span> : null}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell className="RmqColM">{c.user ?? "—"}</Renderer.Component.TableCell>
          <Renderer.Component.TableCell className="RmqNum RmqColS">
            {c.prefetchCount === 0 ? "∞" : formatNumber(c.prefetchCount)}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell className="RmqColL">
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
