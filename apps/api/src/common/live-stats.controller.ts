import { Controller, Get, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { GroupEventsService } from '../groups/group-events.service';
import { PrismaService } from '../prisma/prisma.service';

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

/**
 * The three counts are unindexed aggregates, so they run at most once per window
 * however often the panel (or anyone else) asks. Ten seconds of staleness is
 * invisible on a dashboard and puts a hard ceiling on what a request flood can
 * cost the database.
 */
const CACHE_MS = 10_000;

type DbCounts = {
  playersOnline: number;
  groupsTotal: number;
  membersTotal: number;
};

type LiveStats = DbCounts & {
  viewers: number;
  groupsWatched: number;
  uptimeSeconds: number;
  at: string;
};

/**
 * Live activity counts for the admin panel. Counts only — no names, group
 * names or IPs.
 *
 * Unauthenticated because the panel is served from a different origin, so the
 * protection here is that it is cheap and rate limited rather than secret.
 */
@Controller('stats')
@UseGuards(ThrottlerGuard)
export class LiveStatsController {
  private cached: { at: number; counts: DbCounts } | null = null;
  private inFlight: Promise<DbCounts> | null = null;

  constructor(
    private readonly events: GroupEventsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('live')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async live(): Promise<LiveStats> {
    const viewers = this.events.viewerStats;
    const counts = await this.counts();

    return {
      // Browser tabs holding an open event stream.
      viewers: viewers.total,
      groupsWatched: viewers.groups,
      ...counts,
      uptimeSeconds: Math.round(process.uptime()),
      at: new Date().toISOString(),
    };
  }

  private async counts(): Promise<DbCounts> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return this.cached.counts;
    }
    // Concurrent callers share one query set instead of each starting their own.
    this.inFlight ??= this.loadCounts().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async loadCounts(): Promise<DbCounts> {
    // `online` alone is unreliable — a crashed client never sends its logout,
    // so the flag can stay true forever. Recent activity is the real signal.
    const since = new Date(Date.now() - ONLINE_WINDOW_MS);
    const [playersOnline, groupsTotal, membersTotal] = await Promise.all([
      this.prisma.member.count({
        where: { online: true, lastUpdated: { gte: since } },
      }),
      this.prisma.group.count(),
      this.prisma.member.count(),
    ]);

    const counts = { playersOnline, groupsTotal, membersTotal };
    this.cached = { at: Date.now(), counts };
    return counts;
  }
}
