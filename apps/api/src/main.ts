// Must stay the first import: the OpenTelemetry instrumentations patch http,
// express, @nestjs/core and @prisma/client as those modules are required, so
// anything imported above this line is never traced. Do not sort it down.
import './instrumentation';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Server } from 'node:http';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertEnv } from './config/env';

const PROD_ORIGINS = [
  'https://rs3groupiron.men',
  'https://www.rs3groupiron.men',
];
const DEV_ORIGINS = ['http://localhost:5173'];

function corsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return process.env.NODE_ENV === 'production' ? PROD_ORIGINS : DEV_ORIGINS;
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function bootstrap() {
  // Before the app exists: a bad environment should cost nothing but a clear
  // message, not a half-started process that fails at the first request.
  assertEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind a reverse proxy (nginx/Caddy/Cloudflare) set TRUST_PROXY to the
  // number of hops (usually 1) so rate limiting sees the real client IP.
  // Leave unset when the API is reached directly; otherwise X-Forwarded-For
  // becomes attacker-controlled.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

  app.use(helmet());
  app.use(compression());
  // Registering our own parsers first prevents Nest from adding the
  // default (unlimited) ones on init.
  app.useBodyParser('json', { limit: '256kb' });
  app.useBodyParser('urlencoded', { limit: '256kb', extended: true });

  app.setGlobalPrefix('api', {
    exclude: ['/', 'health', 'health/ready'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  app.enableCors({
    origin: corsOrigins(),
    // Response headers are hidden from cross-origin JS unless named here, so
    // without this the browser could not read the server-timing values.
    exposedHeaders: ['X-Response-Time-Ms', 'Server-Timing'],
  });

  // nginx keeps idle upstream connections pooled (see deploy/configure.sh) and
  // reuses them without checking. Node's default closes an idle connection after
  // 5s, so nginx would keep sending requests down sockets the app had already
  // hung up — surfacing as intermittent 502s under load. Outliving nginx's
  // keepalive_timeout means the proxy is always the side that closes first.
  // headersTimeout must stay above keepAliveTimeout or it pre-empts it.
  const server = app.getHttpAdapter().getHttpServer() as Server;
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((err: unknown) => {
  // Without this the process would exit 0 on an unhandled rejection and look
  // like a clean shutdown to systemd and to the release health gate.
  new Logger('Bootstrap').error(
    err instanceof Error ? err.message : String(err),
    err instanceof Error ? err.stack : undefined,
  );
  process.exit(1);
});
