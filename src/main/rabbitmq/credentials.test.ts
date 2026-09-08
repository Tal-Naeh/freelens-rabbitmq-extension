import { describe, expect, it } from "vitest";
import { RabbitmqError } from "../../common/errors";
import { decodeSecretValue, resolveCredentials, resolveManagementTls } from "./credentials";

import type { DiscoveredRabbitmqInfo } from "../../common/ipc";
import type { KubeReader, KubeSecret } from "./kube-reader";

const b64 = (s: string) => Buffer.from(s).toString("base64");

function readerWith(secrets: Record<string, KubeSecret>): KubeReader {
  return {
    listCustomResources: async () => [],
    listServices: async () => [],
    listWorkloads: async () => [],
    listPods: async () => [],
    getSecret: async (ns, name) => secrets[`${ns}/${name}`] ?? null,
  };
}

describe("resolveCredentials", () => {
  it("reads the operator default-user secret", async () => {
    const reader = readerWith({
      "ns/r-default-user": { data: { username: b64("default_user_x"), password: b64("s3cret\n") } },
    });
    const c = await resolveCredentials(reader, {
      kind: "operator-default-user",
      secret: { namespace: "ns", name: "r-default-user" },
    });
    expect(c).toEqual({ username: "default_user_x", password: "s3cret", source: "Secret ns/r-default-user" });
  });

  it("uses explicit keys and literal username for generic secrets", async () => {
    const reader = readerWith({ "ns/creds": { data: { "rabbitmq-password": b64("pw") } } });
    const c = await resolveCredentials(reader, {
      kind: "secret",
      secret: { namespace: "ns", name: "creds" },
      passwordKey: "rabbitmq-password",
      username: "admin",
    });
    expect(c.username).toBe("admin");
    expect(c.password).toBe("pw");
  });

  it("throws a typed no-credentials error when the secret is missing", async () => {
    await expect(
      resolveCredentials(readerWith({}), { kind: "operator-default-user", secret: { namespace: "ns", name: "gone" } }),
    ).rejects.toMatchObject({ code: "no-credentials" });
    await expect(resolveCredentials(readerWith({}), { kind: "none" })).rejects.toBeInstanceOf(RabbitmqError);
  });

  it("guesses guest/guest when asked", async () => {
    expect(await resolveCredentials(readerWith({}), { kind: "guess", username: "guest" })).toMatchObject({
      username: "guest",
      password: "guest",
    });
  });

  it("decodes base64 and trims", () => {
    expect(decodeSecretValue({ data: { k: b64(" v \n") } }, "k")).toBe("v");
    expect(decodeSecretValue(null, "k")).toBeUndefined();
  });
});

describe("resolveManagementTls", () => {
  const base: DiscoveredRabbitmqInfo = {
    targetId: "t",
    name: "r",
    namespace: "ns",
    source: "operator",
    provider: "x",
    podSelector: "a=b",
    serviceName: "r",
    managementPort: "management-tls",
    managementTls: true,
    amqpTls: true,
    credentialHint: { kind: "none" },
  };
  it("returns nothing for plain HTTP", async () => {
    expect(await resolveManagementTls(readerWith({}), { ...base, managementTls: false })).toBeUndefined();
  });
  it("pins the CA when a CA secret exists, else accepts the pod cert", async () => {
    const pinned = await resolveManagementTls(readerWith({ "ns/ca": { data: { "ca.crt": b64("PEM") } } }), {
      ...base,
      tlsCaSecret: { namespace: "ns", name: "ca" },
    });
    expect(pinned).toEqual({ ca: "PEM", servername: "r.ns.svc", rejectUnauthorized: true });
    expect(await resolveManagementTls(readerWith({}), base)).toEqual({
      servername: "r.ns.svc",
      rejectUnauthorized: false,
    });
  });
});
