/* eslint-disable prettier/prettier */
// Import necessary modules and libraries
import path from 'path';
import * as bodyParser from 'body-parser';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService, ConfigType } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {
  AllExceptionsFilter,
  EnvironmentVariables,
  UtilsService,
} from '@Common';
import { appConfigFactory } from '@Config';
import { AppModule } from './app.module';

// Define an async function to bootstrap the application
async function bootstrap() {
  // Create a NestJS application
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Get instances of necessary services and configurations
  const configService = app.get(ConfigService<EnvironmentVariables, true>);
  const utilsService = app.get(UtilsService);
  const appConfig = app.get<ConfigType<typeof appConfigFactory>>(
    appConfigFactory.KEY,
  );

  // Configure body parsers for JSON and URL-encoded data
  app.use(bodyParser.json({ limit: appConfig.httpPayloadMaxSize }));
  app.use(
    bodyParser.urlencoded({
      limit: appConfig.httpPayloadMaxSize,
      extended: true,
    }),
  );
  
  // Define allowed origins for CORS
  const origins = appConfig.domain
    ? [
        new RegExp(
          `^http[s]{0,1}://(?:${appConfig.domain}|[a-z0-9-]+.${appConfig.domain})$`,
        ),
      ]
    : [];

  // Configure global pipes for input validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: true,
      stopAtFirstError: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Configure global exception filter
  app.useGlobalFilters(
    new AllExceptionsFilter(app.get(HttpAdapterHost), app.get(UtilsService)),
  );

  // Configure CORS for the NestJS application
  app.enableCors({
    origin: utilsService.isProduction()
      ? origins
      : [/^http:\/\/localhost:[0-9]+$/, ...origins],
    credentials: true,
  });

  // Configure cookie parser middleware
  app.use(cookieParser());

  // Configure helmet middleware for security headers
  app.use(
    helmet.crossOriginResourcePolicy({
      policy: utilsService.isProduction() ? 'same-site' : 'cross-origin',
    }),
  );
  
  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Serve static assets from the STORAGE_DIR and static directories
  app.useStaticAssets(
    path.join(process.cwd(), configService.get('STORAGE_DIR')),
    { prefix: `/${configService.get('STORAGE_DIR')}` },
  );
  app.useStaticAssets(path.join(process.cwd(), 'static'), {
    prefix: `/static`,
  });

  // Build and configure Swagger documentation
  const config = new DocumentBuilder()
    .setTitle(appConfig.platformName || '')
    .addServer(appConfig.serverUrl || '')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-spec', app, document, {
    customSiteTitle: `${
      appConfig.platformName || ''
    } OpenAPI Specification`.trim(),
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // Start the NestJS application by listening to the specified port
  await app.listen(configService.get('PORT'));

  // Send messages to the parent process if server spawned with an IPC channel
  if (process.send) {
    process.send('ready');
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception', err);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at: Promise', { promise, reason });
  });
}

// Call the bootstrap function to start the application
bootstrap();
