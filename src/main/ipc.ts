import { Main } from "@freelensapp/extensions";
import { serializeIpcError } from "../common/errors";
import {
  type CredentialsClearRequest,
  type CredentialsSetRequest,
  type CredentialsStateDto,
  type DeleteExchangeRequest,
  type DeleteQueueRequest,
  type DisconnectRequest,
  type DiscoveredRabbitmqInfo,
  type DiscoverRequest,
  type ExchangeRequest,
  type ExchangesRequest,
  type MessagesPeekRequest,
  type OverviewDto,
  type PublishRequest,
  type PurgeQueueRequest,
  type QueueRequest,
  type QueuesRequest,
  RABBITMQ_IPC,
  type RabbitmqProgressEvent,
  type TargetRequest,
  type WriteModeSetRequest,
  type WriteModeStateDto,
  type WriteResultDto,
} from "../common/ipc";
import { createCatalogKubeReader } from "./catalog-kube-reader";
import { activeClusterId, resolveKubeconfigFor } from "./kubeconfig-resolver";
import { discoverRabbitmq } from "./rabbitmq/discovery";
import { createKubeForwarder } from "./rabbitmq/kube-forwarder";
import { type ProgressReporter, RabbitmqSessionManager } from "./rabbitmq/session-manager";

import type { KubeReader } from "./rabbitmq/kube-reader";

function createReader(clusterId?: string): KubeReader {
  return createCatalogKubeReader(clusterId ?? activeClusterId());
}

export class RabbitmqIpcMain extends Main.Ipc {
  private readonly sessions = new RabbitmqSessionManager({
    createReader,
    createForwarder: (clusterId) => createKubeForwarder(resolveKubeconfigFor(clusterId)),
  });

  constructor(extension: Main.LensExtension) {
    super(extension);
    this.registerHandlers();
  }

  /** Wrap a handler so engine errors cross IPC with their code intact. */
  private route<Req, Res>(channel: string, handler: (request: Req) => Promise<Res>): void {
    this.handle(channel, async (_event, request: Req) => {
      try {
        return await handler(request);
      } catch (err) {
        throw serializeIpcError(err);
      }
    });
  }

  private reporter(operationId: string | undefined): ProgressReporter {
    if (!operationId) return () => {};
    return (progress) => {
      const event: RabbitmqProgressEvent = { operationId, ...progress };
      this.broadcast(RABBITMQ_IPC.progress, event);
    };
  }

  private registerHandlers(): void {
    this.route<DiscoverRequest, DiscoveredRabbitmqInfo[]>(RABBITMQ_IPC.discover, async (request) => {
      const report = this.reporter(request.operationId);
      report({
        value: 10,
        phase: "discovery",
        label: "Scanning for RabbitMQ",
        detail: "RabbitmqCluster CRs + Services",
      });
      const targets = await discoverRabbitmq(createReader(request.clusterId), request.namespace);
      report({ value: 100, phase: "done", label: `Found ${targets.length} target(s)` });
      return targets;
    });

    this.route<TargetRequest, OverviewDto>(RABBITMQ_IPC.overview, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), async (s) => {
        const [overview, nodes, vhosts] = await Promise.all([s.client.overview(), s.client.nodes(), s.client.vhosts()]);
        return {
          ...overview,
          nodes,
          vhosts,
          userTags: s.userTags,
          session: {
            localAddress: `${s.tunnel.localHost}:${s.tunnel.localPort}`,
            pod: `${s.tunnel.target.namespace}/${s.tunnel.target.pod}:${s.tunnel.target.port}`,
            username: s.username,
            credentialSource: s.credentialSource,
          },
        };
      }),
    );

    this.route<QueuesRequest, unknown>(RABBITMQ_IPC.queues, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.listQueues(request.vhost),
      ),
    );

    this.route<QueueRequest, unknown>(RABBITMQ_IPC.queueDetail, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.queueDetail(request.vhost, request.queue),
      ),
    );

    this.route<ExchangesRequest, unknown>(RABBITMQ_IPC.exchanges, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.listExchanges(request.vhost),
      ),
    );

    this.route<ExchangeRequest, unknown>(RABBITMQ_IPC.exchangeDetail, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.exchangeDetail(request.vhost, request.exchange),
      ),
    );

    this.route<TargetRequest, unknown>(RABBITMQ_IPC.connections, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.listConnections(),
      ),
    );

    this.route<TargetRequest, unknown>(RABBITMQ_IPC.channels, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.listChannels(),
      ),
    );

    this.route<QueuesRequest, unknown>(RABBITMQ_IPC.consumers, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.listConsumers(request.vhost),
      ),
    );

    // Read-only by construction: the client always sends ackmode=ack_requeue_true.
    this.route<MessagesPeekRequest, unknown>(RABBITMQ_IPC.messagesPeek, (request) =>
      this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.peekMessages(request.vhost, request.queue, request.count ?? 10),
      ),
    );

    // -- credentials (values stay in Main memory) ------------------------------------

    this.route<CredentialsSetRequest, CredentialsStateDto>(RABBITMQ_IPC.credentialsSet, async (request) => {
      this.sessions.setManualCredentials(request.clusterId, request.targetId, request.username, request.password);
      return { targetId: request.targetId, hasManualCredentials: true };
    });

    this.route<CredentialsClearRequest, CredentialsStateDto>(RABBITMQ_IPC.credentialsClear, async (request) => {
      this.sessions.clearManualCredentials(request.clusterId, request.targetId);
      return { targetId: request.targetId, hasManualCredentials: false };
    });

    // -- Write Mode gate + mutating operations ----------------------------------------

    this.route<WriteModeSetRequest, WriteModeStateDto>(RABBITMQ_IPC.writeModeSet, async (request) => ({
      targetId: request.targetId,
      enabled: this.sessions.setWriteMode(request.clusterId, request.targetId, request.enabled),
    }));

    this.route<PublishRequest, unknown>(RABBITMQ_IPC.publish, (request) => {
      this.sessions.assertWriteMode(request.clusterId, request.target.targetId, "Publishing a message");
      return this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.publish(request.vhost, request.exchange, {
          routingKey: request.routingKey,
          payload: request.payload,
          payloadEncoding: request.payloadEncoding,
          properties: request.properties,
        }),
      );
    });

    this.route<PurgeQueueRequest, WriteResultDto>(RABBITMQ_IPC.purgeQueue, async (request) => {
      this.sessions.assertWriteMode(request.clusterId, request.target.targetId, "Purging a queue");
      await this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.purgeQueue(request.vhost, request.queue),
      );
      return { ok: true };
    });

    this.route<DeleteQueueRequest, WriteResultDto>(RABBITMQ_IPC.deleteQueue, async (request) => {
      this.sessions.assertWriteMode(request.clusterId, request.target.targetId, "Deleting a queue");
      await this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.deleteQueue(request.vhost, request.queue, { ifEmpty: request.ifEmpty, ifUnused: request.ifUnused }),
      );
      return { ok: true };
    });

    this.route<DeleteExchangeRequest, WriteResultDto>(RABBITMQ_IPC.deleteExchange, async (request) => {
      this.sessions.assertWriteMode(request.clusterId, request.target.targetId, "Deleting an exchange");
      await this.sessions.withSession(request.clusterId, request.target, this.reporter(request.operationId), (s) =>
        s.client.deleteExchange(request.vhost, request.exchange, { ifUnused: request.ifUnused }),
      );
      return { ok: true };
    });

    this.route<DisconnectRequest, WriteResultDto>(RABBITMQ_IPC.disconnect, async (request) => {
      if (request.targetId) this.sessions.closeTarget(request.clusterId, request.targetId);
      else this.sessions.closeAll();
      return { ok: true };
    });
  }

  async shutdown(): Promise<void> {
    this.sessions.closeAll();
  }
}
