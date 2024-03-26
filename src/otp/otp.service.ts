/* eslint-disable prettier/prettier */
import dayjs from 'dayjs'; 
import { Inject, Injectable } from '@nestjs/common'; 
import { ConfigType } from '@nestjs/config'; 
import { Otp, OtpTransport, Prisma } from '@prisma/client'; 
import { appConfigFactory, otpConfigFactory } from '@Config'; 
import { UtilsService } from '@Common'; 
import { PrismaService } from '../prisma'; 
import {
  MailService,
  RegisterVerificationCodeMailTemplate,
  ResetPasswordVerificationCodeMailTemplate,
} from '../mail';

// Type definitions for responses
export type SendCodeResponse = {
  sentAt: Date;
  timeout: number;
  attempt: number;
  maxAttempt: number;
};

export type VerifyCodeResponse = {
  status: boolean;
  retries: number;
  maxRetries: number;
};

// Enum for OTP context
export enum OtpContext {
  Register = 'register',
  ResetPassword = 'reset_password',
}

// Parameters for SMS OTP
type OtpSmsParams = {
  code: string;
  expirationTime: string;
};

// Parameters for Email OTP
type OtpMailParams = {
  subject: string;
  template: OtpMailTemplate;
};

// Payload for OTP transport
type OtpTransportPayload = { context: OtpContext } & (
  | {
      transport: typeof OtpTransport.Email;
      transportParams: { username: string };
    }
  | {
      transport: typeof OtpTransport.Mobile;
    }
);

// Type for OTP mail template
type OtpMailTemplate =
  | RegisterVerificationCodeMailTemplate
  | ResetPasswordVerificationCodeMailTemplate;

@Injectable()
export class OtpService {
  constructor(
    @Inject(appConfigFactory.KEY)
    private readonly appConfig: ConfigType<typeof appConfigFactory>, // Injecting app configuration
    @Inject(otpConfigFactory.KEY)
    private readonly config: ConfigType<typeof otpConfigFactory>, // Injecting OTP configuration
    private readonly prisma: PrismaService, 
    private readonly utilsService: UtilsService, 
    private readonly mailService: MailService, 
  ) {}

  // Function to create error for temporary block
  private blockError(target: string, blockTimeout: number): Error {
    const duration = this.utilsService.msToHuman(blockTimeout, {
      maxUnit: 'hour',
    });
    return new Error(
      `${target} temporary blocked for ${duration}, due to max wrong attempts or failed retries`,
    );
  }

  // Function to generate OTP code
  private generateCode(length: number): string {
    if (!this.utilsService.isProductionApp()) {
      return this.config.default;
    }

    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars[Math.floor(Math.random() * 10)];
    }
    return code;
  }

  // Function to check if block timeout has occurred
  private isBlockTimeout(lastSentAt: Date, blockTimeout: number): boolean {
    return dayjs().isAfter(dayjs(lastSentAt).add(blockTimeout, 'ms'));
  }

  // Function to check if OTP timeout has occurred
  private isTimeout(lastSentAt: Date, timeout: number): boolean {
    return dayjs().isAfter(dayjs(lastSentAt).add(timeout, 'ms'));
  }

  // Function to find OTP record
  private async find(
    target: string,
    transport: OtpTransport,
  ): Promise<Otp | null> {
    return await this.prisma.otp.findUnique({
      where: {
        transport_target: {
          transport,
          target: target.toLowerCase(), // Can be email address as well
        },
      },
    });
  }

  // Function to update OTP record
  private async update(
    target: string,
    transport: OtpTransport,
    data: Prisma.OtpUpdateInput,
  ): Promise<Otp> {
    return await this.prisma.otp.update({
      data,
      where: {
        transport_target: {
          transport,
          target: target.toLowerCase(),
        },
      },
    });
  }

  // TODO: Configure sms gateway to send an sms
  private async sendSMS(
    target: string,
    params: OtpSmsParams,
  ): Promise<void> {
    if (!this.utilsService.isProductionApp()) return;
  }

  // Function to send OTP via email
  private async sendEmail(
    target: string,
    params: OtpMailParams,
  ): Promise<void> {
    if (!this.utilsService.isProductionApp()) return;

    await this.mailService.send({
      to: target,
      subject: params.subject,
      mailBodyOrTemplate: params.template,
    });
  }

  // Function to get mail parameters based on OTP context
  private getContextMailParams(args: {
    context: OtpContext;
    code: string;
    timeout: number;
    username: string;
  }): OtpMailParams {
    const data = {
      username: args.username,
      code: args.code,
      expirationTime: this.utilsService.msToHuman(args.timeout),
    };

    switch (args.context) {
      case OtpContext.Register:
        return {
          subject: 'Sign up verification code',
          template: {
            name: 'register-verification-code',
            data,
          },
        };
      case OtpContext.ResetPassword:
        return {
          subject: 'Reset password verification code',
          template: {
            name: 'reset-password-verification-code',
            data,
          },
        };
      default:
        throw new Error('Unknown otp context found');
    }
  }

  // Function to send OTP based on transport type
  private async sendCodeOnTarget(
    args: {
      target: string;
      code: string;
      timeout: number;
    } & OtpTransportPayload,
  ): Promise<void> {
    if (args.transport === OtpTransport.Mobile) {
      return await this.sendSMS(args.target, {
        code: args.code,
        expirationTime: this.utilsService.msToHuman(args.timeout),
      });
    }

    if (args.transport === OtpTransport.Email) {
      return await this.sendEmail(
        args.target,
        this.getContextMailParams({
          context: args.context,
          code: args.code,
          timeout: args.timeout,
          username: args.transportParams.username,
        }),
      );
    }
  }
  
// Function to send OTP
async send(
  // Arguments for sending OTP
  args: { target: string } & OtpTransportPayload,
  // Optional overrides for configuration
  overrides?: {
    length?: number; 
    maxAttempt?: number; 
    timeout?: number; 
    blockTimeout?: number; 
  },
): Promise<SendCodeResponse> {
  // Merge default config with overrides
  const config = {
    ...this.config,
    length: overrides?.length || this.config.length,
    maxAttempt: overrides?.maxAttempt || this.config.maxAttempt,
    timeout: overrides?.timeout || this.config.timeout,
    blockTimeout: overrides?.blockTimeout || this.config.blockTimeout,
  };

  // Attempt to find existing OTP record for the target
  let otp = await this.find(args.target, args.transport);

  // If no OTP exists, create a new one and send the code
  if (!otp) {
    const code =
      args.transport === OtpTransport.Mobile
        ? this.config.default
        : this.generateCode(config.length);
    otp = await this.prisma.otp.create({
      data: {
        code,
        lastSentAt: new Date(),
        target: args.target.toLowerCase(),
        transport: args.transport,
      },
    });
    await this.sendCodeOnTarget({
      context: args.context,
      target: args.target,
      code,
      timeout: config.timeout,
      ...(args.transport === OtpTransport.Email
        ? { transport: args.transport, transportParams: args.transportParams }
        : { transport: args.transport }),
    });
  } else {
    // Check if the OTP is blocked due to max attempts and block timeout
    const isBlockTimeout = this.isBlockTimeout(
      otp.lastSentAt,
      config.blockTimeout,
    );

    if (otp.blocked && !isBlockTimeout) {
      throw this.blockError(args.target, config.blockTimeout);
    }

    // Check if resending is allowed within the timeout duration
    if (
      !this.isTimeout(otp.lastSentAt, config.timeout) &&
      !otp.lastCodeVerified
    ) {
      throw new Error(
        `Resend verification code on ${
          args.target
        } not allowed with in ${this.utilsService.msToHuman(config.timeout)}`,
      );
    }

    // Reset attempt count and unblock OTP if the block timeout has passed or OTP has been verified
    if (isBlockTimeout || otp.lastCodeVerified) {
      otp.attempt = 0;
    }

    // Block OTP if max attempts have been reached
    if (config.maxAttempt - otp.attempt === 0) {
      await this.update(args.target, args.transport, { blocked: true });
      throw this.blockError(args.target, config.blockTimeout);
    }

    // Generate a new code and update OTP details
    const code = this.generateCode(config.length);
    otp = await this.update(args.target, args.transport, {
      code,
      lastSentAt: new Date(),
      attempt: otp.attempt + 1,
      retries: 0,
      blocked: false,
      lastCodeVerified: false,
    });
    await this.sendCodeOnTarget({
      context: args.context,
      target: args.target,
      code,
      timeout: config.timeout,
      ...(args.transport === OtpTransport.Email
        ? { transport: args.transport, transportParams: args.transportParams }
        : { transport: args.transport }),
    });
  }

  // Return response with details of the sent OTP
  return {
    sentAt: otp.lastSentAt,
    timeout: config.timeout,
    attempt: otp.attempt,
    maxAttempt: config.maxAttempt,
  };
}

// Function to verify OTP
async verify(
  code: string,
  target: string,
  transport: OtpTransport,
  overrides?: {
    maxRetries?: number; 
    timeout?: number; 
    blockTimeout?: number; 
  },
): Promise<VerifyCodeResponse> {
  // Merge default config with overrides
  const config = {
    ...this.config,
    maxRetries: overrides?.maxRetries || this.config.maxRetries,
    timeout: overrides?.timeout || this.config.timeout,
    blockTimeout: overrides?.blockTimeout || this.config.blockTimeout,
  };

  // Attempt to find existing OTP record for the target
  let otp = await this.find(target, transport);

  // Throw error if no OTP exists for the target
  if (!otp) {
    throw new Error(`No verification code sent on ${target}`);
  }

  // Throw error if OTP is already blocked
  if (otp.blocked) {
    throw this.blockError(target, config.blockTimeout);
  }

  // Throw error if OTP verification has timed out
  if (this.isTimeout(otp.lastSentAt, config.timeout)) {
    throw new Error(`Verification code for ${target} expired, Try resend`);
  }

  // Check if the provided code matches the stored OTP code
  const isMatched = code === otp.code;

  // If code does not match, update retry count and block OTP if max retries reached
  if (!isMatched) {
    otp.retries += 1;
    otp = await this.update(target, transport, {
      retries: otp.retries,
      blocked: config.maxRetries - otp.retries === 0,
    });
  } else {
    // If code matches, mark OTP as verified
    otp = await this.update(target, transport, {
      lastCodeVerified: true,
    });
  }

  // Return verification response with status and retry details
  return {
    status: isMatched,
    retries: otp.retries,
    maxRetries: config.maxRetries,
  };
}
}
