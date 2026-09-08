import http from "node:http";
import https from "node:https";
import { RabbitmqError } from "../../common/errors";

import type { ManagementTls } from "./credentials";

export interface HttpClientOptions {
  host: string;
  port: number;
  auth: { username: string; password: string };
  tls?: ManagementTls;
  timeoutMs: number;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface JsonHttpClient {
  request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
}

function mapStatus(status: number, path: string, text: string): RabbitmqError {
  let detail = text;
  try {
    const parsed = JSON.parse(text) as { reason?: string; error?: string };
    detail = parsed.reason ?? parsed.error ?? text;
  } catch {
    // keep raw text
  }
  const suffix = detail ? `: ${detail}` : "";
  if (status === 401) return new RabbitmqError("unauthorized", `Management API rejected the credentials${suffix}`, 401);
  if (status === 403) return new RabbitmqError("forbidden", `Management API forbids this operation${suffix}`, 403);
  if (status === 404) return new RabbitmqError("not-found", `${path} not found${suffix}`, 404);
  return new RabbitmqError("unknown", `Management API ${method(status)} ${path} → HTTP ${status}${suffix}`, status);
}

function method(status: number): string {
  return status >= 500 ? "server error on" : "request";
}

/**
 * Minimal JSON-over-HTTP(S) client on Node's core modules — no AMQP, no heavy dependency.
 * Speaks to the Management API through the local port-forward tunnel.
 */
export function createJsonHttpClient(options: HttpClientOptions): JsonHttpClient {
  const authorization = `Basic ${Buffer.from(`${options.auth.username}:${options.auth.password}`).toString("base64")}`;
  const agent = options.tls
    ? new https.Agent({
        keepAlive: true,
        maxSockets: 4,
        ca: options.tls.ca,
        rejectUnauthorized: options.tls.rejectUnauthorized,
      })
    : new http.Agent({ keepAlive: true, maxSockets: 4 });

  return {
    request<T>(httpMethod: HttpMethod, path: string, body?: unknown): Promise<T> {
      const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      const headers: Record<string, string> = {
        authorization,
        // Some management endpoints (e.g. DELETE .../contents) answer 406 to a strict JSON-only Accept.
        accept: "application/json, */*;q=0.1",
      };
      if (payload) {
        headers["content-type"] = "application/json";
        headers["content-length"] = String(payload.length);
      }
      return new Promise<T>((resolve, reject) => {
        const lib = options.tls ? https : http;
        const req = lib.request(
          {
            host: options.host,
            port: options.port,
            method: httpMethod,
            path,
            headers,
            agent,
            timeout: options.timeoutMs,
            ...(options.tls ? { servername: options.tls.servername } : {}),
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
              const status = res.statusCode ?? 0;
              const text = Buffer.concat(chunks).toString("utf8");
              if (status < 200 || status >= 300) {
                reject(mapStatus(status, path, text));
                return;
              }
              if (!text) {
                resolve(undefined as T);
                return;
              }
              try {
                resolve(JSON.parse(text) as T);
              } catch (err) {
                reject(new RabbitmqError("unknown", `invalid JSON from ${path}: ${(err as Error).message}`));
              }
            });
          },
        );
        req.on("timeout", () => {
          req.destroy(new RabbitmqError("timeout", `${httpMethod} ${path} timed out after ${options.timeoutMs}ms`));
        });
        req.on("error", (err: NodeJS.ErrnoException) => {
          if (err instanceof RabbitmqError) {
            reject(err);
            return;
          }
          const code = err.code ?? "";
          if (/ECONNREFUSED|ECONNRESET|EPIPE|ETIMEDOUT|EHOSTUNREACH|socket hang up/.test(`${code} ${err.message}`)) {
            reject(
              new RabbitmqError(
                "unreachable",
                `Management API unreachable through the tunnel (${code || err.message})`,
              ),
            );
            return;
          }
          reject(new RabbitmqError("unknown", err.message));
        });
        if (payload) req.write(payload);
        req.end();
      });
    },
  };
}
