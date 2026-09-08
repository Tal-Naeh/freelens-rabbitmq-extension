import { Renderer } from "@freelensapp/extensions";
import { ArgumentsView, EmptyState } from "../components/page-shell";

import type { BindingDto } from "../../common/ipc";

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
        <Renderer.Component.TableCell sortBy="source">Source exchange</Renderer.Component.TableCell>
        <Renderer.Component.TableCell sortBy="routingKey">Routing key</Renderer.Component.TableCell>
        <Renderer.Component.TableCell sortBy="destination">Destination</Renderer.Component.TableCell>
        <Renderer.Component.TableCell>Arguments</Renderer.Component.TableCell>
      </Renderer.Component.TableHead>
      {bindings.map((b, i) => (
        <Renderer.Component.TableRow key={`${b.source}|${b.destination}|${b.routingKey}|${i}`} sortItem={b} nowrap>
          <Renderer.Component.TableCell>
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
          <Renderer.Component.TableCell>
            <span className="RmqMono">{b.routingKey || <span className="RmqMuted">(empty)</span>}</span>
          </Renderer.Component.TableCell>
          <Renderer.Component.TableCell>
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
          <Renderer.Component.TableCell>
            <ArgumentsView args={b.arguments} />
          </Renderer.Component.TableCell>
        </Renderer.Component.TableRow>
      ))}
    </Renderer.Component.Table>
  );
}
