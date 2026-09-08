import { RabbitmqError } from "../../common/errors";

import type { CredentialHint, DiscoveredRabbitmqInfo } from "../../common/ipc";
import type { KubeReader, KubeSecret } from "./kube-reader";

export interface ResolvedCredentials {
  username: string;
  password: string;
  /** Human-readable origin for the UI ("Secret rabbit/rabbit-default-user", "manual", "guest fallback"). */
  source: string;
}

export interface ManagementTls {
  ca?: string;
  servername: string;
  rejectUnauthorized: boolean;
}

export function decodeSecretValue(secret: KubeSecret | null | undefined, key: string): string | undefined {
  const value = secret?.data?.[key];
  return value === undefined ? undefined : Buffer.from(value, "base64").toString("utf8").trim();
}

/** Resolve a username/password pair from the discovery hint. Secret VALUES never leave Main. */
export async function resolveCredentials(reader: KubeReader, hint: CredentialHint): Promise<ResolvedCredentials> {
  switch (hint.kind) {
    case "operator-default-user": {
      const secret = await reader.getSecret(hint.secret.namespace, hint.secret.name);
      const username = decodeSecretValue(secret, "username");
      const password = decodeSecretValue(secret, "password");
      if (!username || !password) {
        throw new RabbitmqError(
          "no-credentials",
          `Secret ${hint.secret.namespace}/${hint.secret.name} has no username/password (is the operator's default user secret missing?)`,
        );
      }
      return { username, password, source: `Secret ${hint.secret.namespace}/${hint.secret.name}` };
    }
    case "secret": {
      const secret = await reader.getSecret(hint.secret.namespace, hint.secret.name);
      const password = decodeSecretValue(secret, hint.passwordKey ?? "password");
      const username =
        (hint.usernameKey ? decodeSecretValue(secret, hint.usernameKey) : undefined) ??
        hint.username ??
        decodeSecretValue(secret, "username") ??
        decodeSecretValue(secret, "rabbitmq-username");
      if (!password || !username) {
        throw new RabbitmqError(
          "no-credentials",
          `Secret ${hint.secret.namespace}/${hint.secret.name} does not contain the expected credential keys`,
        );
      }
      return { username, password, source: `Secret ${hint.secret.namespace}/${hint.secret.name}` };
    }
    case "guess":
      return { username: hint.username, password: "guest", source: "default guest credentials" };
    case "none":
      throw new RabbitmqError("no-credentials", "no credential source was discovered for this target");
  }
}

/** TLS options for an HTTPS Management API reached through the local tunnel. */
export async function resolveManagementTls(
  reader: KubeReader,
  target: DiscoveredRabbitmqInfo,
): Promise<ManagementTls | undefined> {
  if (!target.managementTls) return undefined;
  const servername = target.serviceName
    ? `${target.serviceName}.${target.namespace}.svc`
    : `${target.name}.${target.namespace}.svc`;
  if (!target.tlsCaSecret) {
    // No CA to pin: the tunnel itself is authenticated by the Kubernetes API, so accept the pod cert.
    return { servername, rejectUnauthorized: false };
  }
  const secret = await reader.getSecret(target.tlsCaSecret.namespace, target.tlsCaSecret.name);
  const ca = decodeSecretValue(secret, "ca.crt") ?? decodeSecretValue(secret, "tls.crt");
  return ca ? { ca, servername, rejectUnauthorized: true } : { servername, rejectUnauthorized: false };
}
