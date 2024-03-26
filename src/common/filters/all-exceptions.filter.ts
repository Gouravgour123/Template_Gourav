import { isAxiosError } from 'axios';
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { UtilsService } from '../providers';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly utilsService: UtilsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (!this.utilsService.isProduction()) {
      console.error(exception);
    }

    // In certain situations `httpAdapter` might not be available in the
    // constructor method, thus we should resolve it here.
    const { httpAdapter } = this.httpAdapterHost;

    const ctx = host.switchToHttp();

    const httpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    // TODO: Create DTO to transmit the error response to the client
    const responseBody =
      exception instanceof HttpException
        ? exception.getResponse()
        : {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message:
              exception instanceof Error && !isAxiosError(exception)
                ? exception.message
                : 'Internal server error',
          };

    httpAdapter.reply(ctx.getResponse(), responseBody, httpStatus);
  }
}
