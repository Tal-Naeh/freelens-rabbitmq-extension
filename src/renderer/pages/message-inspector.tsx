import { Renderer } from "@freelensapp/extensions";
import { useState } from "react";
import { RABBITMQ_PEEK_DEFAULT_COUNT, RABBITMQ_PEEK_MAX_COUNT } from "../../common/constants";
import { parseIpcError } from "../../common/errors";
import { ErrorPanel, KeyValueList } from "../components/page-shell";
import { formatBytes, prettyJson } from "../format";

import type { MessagesPeekDto, PeekedMessageDto, RabbitmqIpcErrorShape } from "../../common/ipc";

function Payload({ message }: { message: PeekedMessageDto }) {
  if (message.contentKind === "binary") {
    return (
      <>
        <p className="RmqMuted">Binary payload shown as base64.</p>
        <pre>{message.payload}</pre>
      </>
    );
  }
  return <pre>{message.contentKind === "json" ? prettyJson(message.payload) : message.payload}</pre>;
}

function MessageCard({ message }: { message: PeekedMessageDto }) {
  const [open, setOpen] = useState(message.index === 0);
  const props = message.properties;
  const headers = (props.headers as Record<string, unknown> | undefined) ?? {};
  const propEntries = Object.entries(props).filter(([k]) => k !== "headers");
  return (
    <article className="RmqMessage">
      <div className="RmqMessageHead" onClick={() => setOpen((o) => !o)} role="button" tabIndex={0}>
        <Renderer.Component.Icon material={open ? "expand_more" : "chevron_right"} small />
        <span className="RmqMessageIdx">#{message.index + 1}</span>
        <span className="RmqMono">{message.routingKey || "(no routing key)"}</span>
        <span className="RmqMessageMeta">via {message.exchange || "(default exchange)"}</span>
        <span className="RmqMessageSpacer" />
        <Renderer.Component.Badge small label={message.contentKind.toUpperCase()} />
        {message.redelivered ? <Renderer.Component.Badge small label="redelivered" /> : null}
        {message.truncated ? <Renderer.Component.Badge small label="truncated" className="warning" /> : null}
        <span className="RmqMessageMeta">{formatBytes(message.payloadBytes)}</span>
      </div>
      {open ? (
        <div className="RmqMessageBody">
          <Payload message={message} />
          {propEntries.length > 0 ? (
            <>
              <h3>Properties</h3>
              <KeyValueList
                entries={propEntries.map(([k, v]) => [k, <code>{typeof v === "string" ? v : JSON.stringify(v)}</code>])}
              />
            </>
          ) : null}
          {Object.keys(headers).length > 0 ? (
            <>
              <h3>Headers</h3>
              <KeyValueList
                entries={Object.entries(headers).map(([k, v]) => [
                  k,
                  <code>{typeof v === "string" ? v : JSON.stringify(v)}</code>,
                ])}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Read-only Message Inspector: fetches up to N messages with `ack_requeue_true`, so nothing is
 * consumed. The broker still flags them `redelivered` — this is inherent to the Management API.
 */
export function MessageInspector({
  peek,
  queueMessages,
}: {
  peek: (count: number) => Promise<MessagesPeekDto>;
  queueMessages: number;
}) {
  const [count, setCount] = useState(String(RABBITMQ_PEEK_DEFAULT_COUNT));
  const [result, setResult] = useState<MessagesPeekDto>();
  const [error, setError] = useState<RabbitmqIpcErrorShape>();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const n = Math.max(1, Math.min(RABBITMQ_PEEK_MAX_COUNT, Number.parseInt(count, 10) || RABBITMQ_PEEK_DEFAULT_COUNT));
    setBusy(true);
    setError(undefined);
    try {
      setResult(await peek(n));
    } catch (err) {
      setError(parseIpcError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="RmqMessages">
      <div className="RmqNotice">
        <Renderer.Component.Icon material="verified_user" small />
        <p>
          Safe peek: messages are fetched with <code>ackmode=ack_requeue_true</code> and immediately re-queued. Nothing
          is consumed or lost. Peeked messages will carry the <em>redelivered</em> flag afterwards.
        </p>
      </div>
      <div className="RmqDrawerToolbar">
        <span className="RmqMuted">Messages to peek (1–{RABBITMQ_PEEK_MAX_COUNT})</span>
        <Renderer.Component.Input
          theme="round-black"
          value={count}
          onChange={setCount}
          type="number"
          min={1}
          max={RABBITMQ_PEEK_MAX_COUNT}
          style={{ width: 80 }}
        />
        <Renderer.Component.Button
          primary
          label={busy ? "Peeking…" : "Peek"}
          disabled={busy || queueMessages === 0}
          onClick={() => void run()}
        />
        {queueMessages === 0 ? <span className="RmqMuted">Queue is empty</span> : null}
        {result ? <span className="RmqMuted">{result.messages.length} message(s) fetched</span> : null}
      </div>
      {error ? <ErrorPanel error={error} onRetry={() => void run()} /> : null}
      {result?.messages.map((m) => (
        <MessageCard key={m.index} message={m} />
      ))}
    </div>
  );
}
