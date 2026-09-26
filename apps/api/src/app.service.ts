import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export type DbProbe =
  | { ok: true; latencyMs: number }
  | { ok: false; latencyMs: number; error: string };

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello() {
    return {
      message: 'RS3 Group Ironman API',
      status: 'ok',
    };
  }

  /**
   * Liveness. Always 200, so a database blip cannot put a host that restarts
   * on failed healthchecks into a loop while Postgres recovers. The database
   * result is in the body; /health/ready returns a failing status code.
   */
  async getHealth() {
    const db = await this.probeDb();
    return {
      status: 'healthy',
      db,
      timestamp: new Date().toISOString(),
    };
  }

  /** Readiness. Same probe, but failures reach the status code. */
  async getReady() {
    const db = await this.probeDb();
    return {
      status: db.ok ? ('ready' as const) : ('degraded' as const),
      db,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * The cheapest possible statement, so the number is connection acquisition
   * plus round trip with no query cost mixed in — which separates "the
   * database is far away" from "this query is expensive".
   */
  private async probeDb(): Promise<DbProbe> {
    const startedAt = process.hrtime.bigint();
    const elapsedMs = () =>
      Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Math.round(elapsedMs() * 100) / 100 };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Math.round(elapsedMs() * 100) / 100,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
