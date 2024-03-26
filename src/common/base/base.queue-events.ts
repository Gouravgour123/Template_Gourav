import { Logger } from '@nestjs/common';
import { OnQueueEvent, QueueEventsHost } from '@nestjs/bullmq';

export abstract class BaseQueueEvents extends QueueEventsHost {
  protected readonly logger;

  constructor(readonly name: string) {
    super();
    this.logger = new Logger(name);
  }

  @OnQueueEvent('error')
  onError(err: Error): void {
    this.logger.error(err);
  }
}
