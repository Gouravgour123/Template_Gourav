// Importing the Module decorator from the NestJS common library
import { Module } from '@nestjs/common';

// Importing the UsersService class from the users.service file
import { UsersService } from './users.service';

// Importing the UsersController class from the users.controller file
import { UsersController } from './users.controller';

// Importing the PrismaModule, presumably for database interactions
import { PrismaModule } from '../prisma';

// Importing the OtpModule, presumably for handling OTP (One-Time Password) functionality
import { OtpModule } from '../otp';

// Declaring a module for managing users within the application
@Module({
  imports: [PrismaModule, OtpModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
