import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AdvisorModule } from './advisor/advisor.module';
import { AlertsModule } from './alerts/alerts.module';
import { AuthModule } from './auth/auth.module';
import { HomeModule } from './home/home.module';
import { PlansModule } from './plans/plans.module';
import { DemoModule } from './demo/demo.module';
import { GoalsModule } from './goals/goals.module';
import { TelegramModule } from './telegram/telegram.module';
import { PushModule } from './push/push.module';
import { MacroModule } from './macro/macro.module';
import { MarketModule } from './market/market.module';
import { NewsModule } from './news/news.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfileModule } from './profile/profile.module';
import { WatchlistModule } from './watchlist/watchlist.module';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MarketModule,
    MacroModule,
    NewsModule,
    ProfileModule,
    PortfolioModule,
    WatchlistModule,
    HomeModule,
    PlansModule,
    DemoModule,
    GoalsModule,
    TelegramModule,
    PushModule,
    AdvisorModule,
    AlertsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
