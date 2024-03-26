/* eslint-disable prettier/prettier */
import { Redis } from 'ioredis';
import {
  Injectable,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Assuming this is the correct import for your environment variables
import { EnvironmentVariables } from 'src/common'; 

@Injectable()
export class RedisService implements OnModuleInit, OnApplicationShutdown {
  client: Redis; // Declare the Redis client

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {}

  async onModuleInit() {
    // Initialize Redis client when the module is initialized
    this.client = new Redis(this.configService.get('REDIS_URI'), {
      lazyConnect: true, 
    });

    // Handle errors that occur in the Redis client
    this.client.on('error', (err: Error) => {
      throw err; 
    });

    // Connect to Redis
    await this.client.connect();
  }
  async onApplicationShutdown() {
    // Gracefully shut down the Redis client when the application is shutting down
    await this.client.quit();
  }
}
