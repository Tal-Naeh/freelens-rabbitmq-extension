import { Renderer } from "@freelensapp/extensions";
import {
  type ChannelsDto,
  type ConnectionsDto,
  type ConsumersDto,
  type CredentialsClearRequest,
  type CredentialsSetRequest,
  type CredentialsStateDto,
  type DeleteExchangeRequest,
  type DeleteQueueRequest,
  type DisconnectRequest,
  type DiscoveredRabbitmqInfo,
  type DiscoverRequest,
  type ExchangeDetailDto,
  type ExchangeRequest,
  type ExchangesDto,
  type ExchangesRequest,
  type MessagesPeekDto,
  type MessagesPeekRequest,
  type OverviewDto,
  type PublishRequest,
  type PublishResultDto,
  type PurgeQueueRequest,
  type QueueDetailDto,
  type QueueRequest,
  type QueuesDto,
  type QueuesRequest,
  RABBITMQ_IPC,
  type RabbitmqProgressEvent,
  type TargetRequest,
  type WriteModeSetRequest,
  type WriteModeStateDto,
  type WriteResultDto,
} from "../common/ipc";

/** Renderer-side client for the RabbitMQ extension's Main IPC handlers. */
export class RabbitmqIpcRenderer extends Renderer.Ipc {
  discover(request: DiscoverRequest = {}): Promise<DiscoveredRabbitmqInfo[]> {
    return this.invoke(RABBITMQ_IPC.discover, request);
  }
  overview(request: TargetRequest): Promise<OverviewDto> {
    return this.invoke(RABBITMQ_IPC.overview, request);
  }
  queues(request: QueuesRequest): Promise<QueuesDto> {
    return this.invoke(RABBITMQ_IPC.queues, request);
  }
  queueDetail(request: QueueRequest): Promise<QueueDetailDto> {
    return this.invoke(RABBITMQ_IPC.queueDetail, request);
  }
  exchanges(request: ExchangesRequest): Promise<ExchangesDto> {
    return this.invoke(RABBITMQ_IPC.exchanges, request);
  }
  exchangeDetail(request: ExchangeRequest): Promise<ExchangeDetailDto> {
    return this.invoke(RABBITMQ_IPC.exchangeDetail, request);
  }
  connections(request: TargetRequest): Promise<ConnectionsDto> {
    return this.invoke(RABBITMQ_IPC.connections, request);
  }
  channels(request: TargetRequest): Promise<ChannelsDto> {
    return this.invoke(RABBITMQ_IPC.channels, request);
  }
  consumers(request: QueuesRequest): Promise<ConsumersDto> {
    return this.invoke(RABBITMQ_IPC.consumers, request);
  }
  messagesPeek(request: MessagesPeekRequest): Promise<MessagesPeekDto> {
    return this.invoke(RABBITMQ_IPC.messagesPeek, request);
  }
  credentialsSet(request: CredentialsSetRequest): Promise<CredentialsStateDto> {
    return this.invoke(RABBITMQ_IPC.credentialsSet, request);
  }
  credentialsClear(request: CredentialsClearRequest): Promise<CredentialsStateDto> {
    return this.invoke(RABBITMQ_IPC.credentialsClear, request);
  }
  writeModeSet(request: WriteModeSetRequest): Promise<WriteModeStateDto> {
    return this.invoke(RABBITMQ_IPC.writeModeSet, request);
  }
  publish(request: PublishRequest): Promise<PublishResultDto> {
    return this.invoke(RABBITMQ_IPC.publish, request);
  }
  purgeQueue(request: PurgeQueueRequest): Promise<WriteResultDto> {
    return this.invoke(RABBITMQ_IPC.purgeQueue, request);
  }
  deleteQueue(request: DeleteQueueRequest): Promise<WriteResultDto> {
    return this.invoke(RABBITMQ_IPC.deleteQueue, request);
  }
  deleteExchange(request: DeleteExchangeRequest): Promise<WriteResultDto> {
    return this.invoke(RABBITMQ_IPC.deleteExchange, request);
  }
  disconnect(request: DisconnectRequest): Promise<WriteResultDto> {
    return this.invoke(RABBITMQ_IPC.disconnect, request);
  }
  onProgress(listener: (event: RabbitmqProgressEvent) => void): () => void {
    return this.listen(RABBITMQ_IPC.progress, (_event, payload: RabbitmqProgressEvent) => listener(payload));
  }
}
