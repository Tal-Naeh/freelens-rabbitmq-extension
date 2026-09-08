import type { RabbitmqIpcErrorShape } from "./ipc";

export type RabbitmqErrorCode = RabbitmqIpcErrorShape["code"];

/** Typed error used throughout the Main engine; serialized across IPC via {@link serializeIpcError}. */
export class RabbitmqError extends Error {
  constructor(
    readonly code: RabbitmqErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RabbitmqError";
  }
}

const MARKER = "RABBITMQ_IPC_ERROR:";

/** Electron keeps only `message` when an `invoke` handler rejects, so the shape rides inside it. */
export function serializeIpcError(error: unknown): Error {
  const shape: RabbitmqIpcErrorShape =
    error instanceof RabbitmqError
      ? { code: error.code, message: error.message, status: error.status }
      : { code: "unknown", message: error instanceof Error ? error.message : String(error) };
  return new Error(`${MARKER}${JSON.stringify(shape)}`);
}

/** Inverse of {@link serializeIpcError}; tolerant of Electron's "Error invoking remote method" wrapping. */
export function parseIpcError(error: unknown): RabbitmqIpcErrorShape {
  const message = error instanceof Error ? error.message : String(error);
  const at = message.indexOf(MARKER);
  if (at >= 0) {
    try {
      const parsed = JSON.parse(message.slice(at + MARKER.length)) as Partial<RabbitmqIpcErrorShape>;
      if (parsed && typeof parsed.message === "string") {
        return { code: parsed.code ?? "unknown", message: parsed.message, status: parsed.status };
      }
    } catch {
      // fall through to the generic shape
    }
  }
  return { code: "unknown", message };
}
