import { Renderer } from "@freelensapp/extensions";
import { ArgumentsView, EmptyState } from "../components/page-shell";
import { type ColumnSpec, useResizableColumns } from "../components/resizable-columns";

import type { BindingDto } from "../../common/ipc";

const RABBITMQ_BINDINGS_COLUMNS: ColumnSpec[] = [
  { id: "source", width: 220, minWidth: 100 },
  { id: "routingKey", width: 200, minWidth: 100 },
  { id: "destination", width: 240, grow: true, minWidth: 120 },
  { id: "arguments", width: 220, minWidth: 100 },
];

export function BindingsTable({
  bindings,
  tableId,
  emptyLabel,
  onOpenQueue,
  onOpenExchange,
}: {
  bindings: BindingDto[];
  tableId: string;
  emptyLabel: string;
  onOpenQueue?: (vhost: string, queue: string) => void;
  onOpenExchange?: (vhost: string, exchange: string) => void;
}) {
  const col = useResizableColumns("rabbitmq-bindings", RABBITMQ_BINDINGS_COLUMNS);
  if (bindings.length === 0) return <EmptyState icon="link_off" title={emptyLabel} />;
  return (
    <Renderer.Component.Table<BindingDto>
      tableId={tableId}
      autoSize={false}
      scrollable={false}
      sortSyncWithUrl={false}
      sortByDefault={{ sortBy: "source", orderBy: "asc" }}
      sortable={{ source: (b) => b.source, destination: (b) => b.destination, routingKey: (b) => b.routingKey }}
    >
      <Renderer.Component.TableHead sticky={false} nowrap>
        <Renderer.Component.TableCell {...col.head("source")} sortBy="source">
          Source exchange
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("routingKey")} sortBy="routingKey">
          Routing key
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("destination")} sortBy="destination">
          Destination
        </Renderer.Component.TableCell>
        <Renderer.Component.TableCell {...col.head("arguments")}>Arguments</Renderer.Component.TableCell>
      </Renderer.Component.TableHead>
      {bindings.map((b, i) => (
        <Renderer.Component.TableRow key={`${b.source}|${b.destination}|${b.routingKey}|${i}`} sortItem={b} nowrap>
          <Renderer.Component.TableCell {...col.cell("source")}>
            {b.source ? (
              onOpenExchange ? (
                <span className="RmqLink RmqMono" onClick={() => onOpenExchange(b.vhost, b.source)}>
                  {b.source}
                </span>
              ) : (
                <span className="RmqMono">{b.source}</span>
              )
            ) : (
              <span className="RmqMuted">(default exchange)</span>
            )}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("routingKey")}>
            <span className="RmqMono">{b.routingKey || <span className="RmqMuted">(empty)</span>}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("destination")}>
            <Renderer.Component.Badge small label={b.destinationType} />{" "}
            {b.destinationType === "queue" && onOpenQueue ? (
              <span className="RmqLink RmqMono" onClick={() => onOpenQueue(b.vhost, b.destination)}>
                {b.destination}
              </span>
            ) : b.destinationType === "exchange" && onOpenExchange ? (
              <span className="RmqLink RmqMono" onClick={() => onOpenExchange(b.vhost, b.destination)}>
                {b.destination}
              </span>
            ) : (
              <span className="RmqMono">{b.destination}</span>
            )}
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell {...col.cell("arguments")}>
            <ArgumentsView args={b.arguments} />
          </Renderer.Component.TableCell>
        </Renderer.Component.TableRow>
      ))}
    </Renderer.Component.Table>
  );
}
