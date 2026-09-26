import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Prisma defaults to `cpus * 2 + 1` — about 5 on a small container. */
const DEFAULT_POOL_SIZE = 20;
const DEFAULT_POOL_TIMEOUT = 15;

/**
 * Applies pool settings unless the URL already carries them.
 *
 * Done in code because hosts inject DATABASE_URL, so appending query
 * parameters by hand means getting `?` vs `&` right against a value you do not
 * control. An explicit `connection_limit` still wins.
 */
export function withPoolSettings(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set(
        'connection_limit',
        process.env.DB_POOL_SIZE ?? String(DEFAULT_POOL_SIZE),
      );
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set(
        'pool_timeout',
        process.env.DB_POOL_TIMEOUT ?? String(DEFAULT_POOL_TIMEOUT),
      );
    }
    return url.toString();
  } catch {
    // Unparseable: leave it alone rather than risk breaking the connection.
    return rawUrl;
  }
}

/**
 * Reads the pool size back out of the URL actually given to Prisma. Logging
 * the *intended* value would hide a URL that failed to parse, where the
 * settings were never applied at all.
 */
export function describePool(url: string | null): string {
  if (!url) return 'no DATABASE_URL';
  try {
    const limit = new URL(url).searchParams.get('connection_limit');
    return limit
      ? `connection_limit=${limit}`
      : 'connection_limit unset — Prisma default (~cpus * 2 + 1)';
  } catch {
    return 'connection_limit unknown — DATABASE_URL could not be parsed';
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly resolvedUrl: string | null;

  constructor() {
    const rawUrl = process.env.DATABASE_URL;
    const resolvedUrl = rawUrl ? withPoolSettings(rawUrl) : null;
    super(resolvedUrl ? { datasourceUrl: resolvedUrl } : {});
    this.resolvedUrl = resolvedUrl;
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`connected (${describePool(this.resolvedUrl)})`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
