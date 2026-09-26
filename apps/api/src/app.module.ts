import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { LiveStatsController } from './common/live-stats.controller';
import { ServerTimingInterceptor } from './common/server-timing.interceptor';
import { GamevalsModule } from './gamevals/gamevals.module';
import { GroupsModule } from './groups/groups.module';
import { PrismaModule } from './prisma/prisma.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Not registered as APP_GUARD on purpose: only unauthenticated routes
    // opt in via @UseGuards(ThrottlerGuard). Authed group/:groupName routes
    // must never be throttled (plugin pushes in bursts).
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
    }),
    PrismaModule,
    GamevalsModule,
    GroupsModule,
    UploadsModule,
  ],
  controllers: [AppController, LiveStatsController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: ServerTimingInterceptor },
  ],
})
export class AppModule {}
