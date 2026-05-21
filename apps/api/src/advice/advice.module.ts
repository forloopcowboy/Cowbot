import { Module } from '@nestjs/common';

import { MarketModule } from '../market/market.module';
import { ProfilesModule } from '../profiles/profiles.module';
import { HoldingsModule } from '../holdings/holdings.module';

import { AdviceController, AdvicesController } from './advice.controller';
import { AdviceService } from './advice.service';
import { MarketSnapshotService } from './market-snapshot.service';

@Module({
  imports: [MarketModule, ProfilesModule, HoldingsModule],
  controllers: [AdviceController, AdvicesController],
  providers: [AdviceService, MarketSnapshotService],
})
export class AdviceModule {}
