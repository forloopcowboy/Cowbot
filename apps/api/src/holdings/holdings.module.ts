import { Module } from '@nestjs/common';
import { HoldingsController } from './holdings.controller';
import { HoldingsService } from './holdings.service';
import { ProfilesModule } from '../profiles/profiles.module';

@Module({
  imports: [ProfilesModule],
  controllers: [HoldingsController],
  providers: [HoldingsService],
  exports: [HoldingsService],
})
export class HoldingsModule {}
