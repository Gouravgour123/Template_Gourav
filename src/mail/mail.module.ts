// Import necessary modules and classes
import { Queue } from 'bullmq';
import { Module, OnApplicationShutdown } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { MAIL_QUEUE } from './mail.constants'; 
import { MailService } from './mail.service'; 
import { MailProcessor } from './mail.processor'; 
import { QueueModule } from '../queue'; 

@Module({
  // Define module metadata
  imports: [QueueModule.registerAsync(MAIL_QUEUE)], // Register mail queue asynchronously
  providers: [MailService, MailProcessor],
  exports: [MailService], 
})
export class MailModule implements OnApplicationShutdown {
  // Inject mail queue into the module
  constructor(
    @InjectQueue(MAIL_QUEUE)
    private readonly mailQueue: Queue,
  ) {}

  // Method called when the application shuts down
  async onApplicationShutdown() {
    // Disconnect the mail queue
    await this.mailQueue.disconnect();
  }
}
