import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthController } from './health.controller';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { ProfilesModule } from './profiles/profiles.module';
import { HoldingsModule } from './holdings/holdings.module';
import { ReportsModule } from './reports/reports.module';
import { MarketModule } from './market/market.module';
import { SettingsModule } from './settings/settings.module';
import { PythonModule } from './python/python.module';
import { PdfModule } from './pdf/pdf.module';
import { AdviceModule } from './advice/advice.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    ProfilesModule,
    HoldingsModule,
    ReportsModule,
    MarketModule,
    SettingsModule,
    PythonModule,
    PdfModule,
    AdviceModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
