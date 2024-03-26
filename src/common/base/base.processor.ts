// Import necessary modules and decorators from NestJS
import { OnModuleInit, Logger } from '@nestjs/common';
import { OnWorkerEvent, WorkerHost } from '@nestjs/bullmq';

// Define an abstract class named BaseProcessor that extends WorkerHost and implements OnModuleInit
export abstract class BaseProcessor extends WorkerHost implements OnModuleInit {
  protected readonly logger;

  constructor(
    readonly name: string,
    private readonly concurrency = 1,
  ) {
    super();
    this.logger = new Logger(name);
  }

    onModuleInit() {
    this.worker.concurrency = this.concurrency;
  }

  async onApplicationShutdown(): Promise<void> {
    await this.worker.close();
  }

  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(err);
  }
}
