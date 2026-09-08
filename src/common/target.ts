/**
 * Stable identity for a discovered RabbitMQ target. The id is safe to put in a URL
 * (page params) and to use as a session key.
 */
export function createRabbitmqTargetId(namespace: string, name: string, source: string): string {
  const raw = `${source}/${namespace}/${name}`;
  return raw.replace(/[^A-Za-z0-9_./-]/g, "_");
}

/** Encodes a vhost / queue / exchange name for use as a Management API path segment (`/` → `%2F`). */
export function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}
