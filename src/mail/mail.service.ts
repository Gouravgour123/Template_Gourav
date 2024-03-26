// Import necessary modules and classes
import path from 'path';
import pug from 'pug';
import nodemailer from 'nodemailer';
import { Queue } from 'bullmq';
import { SentMessageInfo } from 'nodemailer/lib/smtp-transport';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { mailConfigFactory, mailQueueConfigFactory } from '@Config'; 
import { MAIL_QUEUE } from './mail.constants'; 
import { MailTemplate } from './mail.types'; 

// Define the payload structure for sending messages
export type SendMessagePayload = {
  to: string; 
  subject: string; 
  mailBodyOrTemplate: string | MailTemplate;
  attachments?: string[]; 
  replyTo?: string; 
};

@Injectable()
export class MailService {
  transporter; 
  // Constructor to inject dependencies
  constructor(
    @Inject(mailConfigFactory.KEY)
    private readonly config: ConfigType<typeof mailConfigFactory>, 
    @Inject(mailQueueConfigFactory.KEY)
    private readonly queueConfig: ConfigType<typeof mailQueueConfigFactory>, 
    @InjectQueue(MAIL_QUEUE)
    private readonly mailQueue: Queue<SendMessagePayload, SentMessageInfo>, 
  ) {
    // Create Nodemailer transporter using configuration settings
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      auth: {
        user: this.config.auth.user,
        pass: this.config.auth.pass,
      },
    });
  }

  // Method to configure message options
  configureMessage = (
    to: string,
    subject: string,
    mailBody: string,
    attachments?: string[],
    replyTo?: string,
  ) => {
    const messageConfiguration: Record<string, unknown> = {
      from: this.config.sender, // Sender email address
      to, 
      subject, 
      html: mailBody, 
      attachments: attachments ? attachments : [], // Attachments (if provided)
    };

    if (replyTo) {
      messageConfiguration.replyTo = replyTo; // Reply-to email address (if provided)
    }

    return messageConfiguration; // Return message configuration
  };

  // Method to render email template using Pug
  async renderTemplate(template: MailTemplate) {
    return await pug.renderFile(
      path.resolve('templates', 'mail', `${template.name}.pug`), // Resolve path to mail template
      'data' in template ? template.data : {}, // Pass template data to Pug renderer (if provided)
    );
  }

  // Method to send email by adding job to the mail queue
  async send(mailPayload: SendMessagePayload): Promise<void> {
    await this.mailQueue.add('send', mailPayload, this.queueConfig.options); // Add job to mail queue
  }
}
