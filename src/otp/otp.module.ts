import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { PrismaModule } from '../prisma';
import { MailModule } from '../mail';

@Module({
  imports: [PrismaModule, MailModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
