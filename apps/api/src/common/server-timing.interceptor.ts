import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';

/**
 * Reports server-side duration, so a load test can subtract the round trip
 * instead of measuring client + network + proxy + server as one number.
 *
 * `Server-Timing` shows up in browser devtools; `X-Response-Time-Ms` is the
 * plain one for scripts.
 */
@Injectable()
export class ServerTimingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    const writeHeaders = () => {
      // An error path may already have flushed; setting headers then throws.
      if (response.headersSent) return;
      const ms = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const rounded = Math.round(ms * 100) / 100;
      response.setHeader('X-Response-Time-Ms', String(rounded));
      response.setHeader('Server-Timing', `app;dur=${rounded}`);
    };

    // Both paths: a slow failure is as interesting as a slow success.
    return next.handle().pipe(tap({ next: writeHeaders, error: writeHeaders }));
  }
}
