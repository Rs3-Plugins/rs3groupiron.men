import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

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
    exclude: ['/', 'health'],
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
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
