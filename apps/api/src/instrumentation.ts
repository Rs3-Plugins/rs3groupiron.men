/**
 * OpenTelemetry bootstrap. Must be the first import in main.ts — the
 * instrumentations patch http, express, @nestjs/core and @prisma/client as
 * those modules are required, so anything loaded earlier is never traced.
 *
 * Inert unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';

// ConfigModule reads .env too, but only inside NestFactory.create() — long
// after this runs. Hosts inject real environment variables and ship no .env.
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // No .env on disk; the host populated process.env.
  }
}

const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();

if (!endpoint) {
  // Said out loud, because "empty traces" otherwise looks like a broken
  // collector rather than a missing variable.
  console.log('[otel] OTEL_EXPORTER_OTLP_ENDPOINT unset — tracing disabled');
} else {
  if (process.env.OTEL_LOG_LEVEL?.toLowerCase() === 'debug') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'rs3-gim-api',
      [ATTR_SERVICE_VERSION]: process.env.OTEL_SERVICE_VERSION ?? '0.0.1',
      // Still in the `incubating` entrypoint, whose exports may move.
      'deployment.environment.name': process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: Number(
        process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 60_000,
      ),
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Otherwise every file read is a span, burying the HTTP and DB ones.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        // helmet, compression, cors and the body parsers were ~25% of all
        // spans and never where the time goes. Dropping the middleware layer
        // keeps route names like `GET /api/group/:groupName/...`.
        '@opentelemetry/instrumentation-express': {
          ignoreLayersType: [ExpressLayerType.MIDDLEWARE],
        },
        '@opentelemetry/instrumentation-http': {
          // The healthcheck would otherwise dominate trace volume.
          ignoreIncomingRequestHook: (req) => {
            const url = req.url ?? '';
            return url === '/health' || url.startsWith('/health?');
          },
        },
      }),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();
  console.log(`[otel] tracing -> ${endpoint}`);

  // Nest does not call enableShutdownHooks(), so SIGTERM would kill the
  // process with spans still queued. Adding a listener suppresses Node's
  // default terminate, so exit explicitly.
  const shutdown = (signal: string) => {
    void sdk
      .shutdown()
      .catch((err: unknown) => console.error('[otel] shutdown failed', err))
      .finally(() => {
        console.log(`[otel] flushed on ${signal}`);
        process.exit(0);
      });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}
