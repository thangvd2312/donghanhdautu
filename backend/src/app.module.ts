import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdvisorModule } from './advisor/advisor.module';
import { AiModule } from './ai/ai.module';
import { AlertsModule } from './alerts/alerts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { HomeModule } from './home/home.module';
import { JournalModule } from './journal/journal.module';
import { PlansModule } from './plans/plans.module';
import { DemoModule } from './demo/demo.module';
import { EventsModule } from './events/events.module';
import { GoalsModule } from './goals/goals.module';
import { TelegramModule } from './telegram/telegram.module';
import { PushModule } from './push/push.module';
import { LogosModule } from './logos/logos.module';
import { MacroModule } from './macro/macro.module';
import { MarketModule } from './market/market.module';
import { NewsModule } from './news/news.module';
import { AnalysisModule } from './portfolio/analysis/analysis.module';
import { DividendsModule } from './portfolio/dividends/dividends.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PortfolioAlertsModule } from './portfolio-alerts/portfolio-alerts.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { RuntimeModule } from './runtime/runtime.module';
import { ProfileModule } from './profile/profile.module';
import { PracticeModule } from './practice/practice.module';
import { ReportsModule } from './reports/reports.module';
import { ScreenerModule } from './screener/screener.module';
import { TipsModule } from './tips/tips.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { HoldingDraftsModule } from './holding-drafts/holding-drafts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Không có ScheduleModule: @Cron / @Interval chỉ chạy ở worker (worker/worker.module.ts)
    PrismaModule,
    RuntimeModule,
    AnalyticsModule,
    AiModule,
    AuthModule,
    MarketModule,
    MacroModule,
    NewsModule,
    ProfileModule,
    PortfolioModule,
    HoldingDraftsModule,
    AnalysisModule,
    DividendsModule,
    WatchlistModule,
    HomeModule,
    PlansModule,
    JournalModule,
    DemoModule,
    GoalsModule,
    TelegramModule,
    PushModule,
    LogosModule,
    AdvisorModule,
    AlertsModule,
    EventsModule,
    ScreenerModule,
    PracticeModule,
    PortfolioAlertsModule,
    ReportsModule,
    TipsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
