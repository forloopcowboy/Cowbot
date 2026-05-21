import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ProfilesModule } from '../profiles/profiles.module';
import { PythonModule } from '../python/python.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [ProfilesModule, PythonModule, PdfModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
