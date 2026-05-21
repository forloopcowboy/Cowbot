import { Module } from '@nestjs/common';
import { JobBus } from './job-bus.service';
import { PythonRunnerService } from './python-runner.service';
import { ProfilesModule } from '../profiles/profiles.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ProfilesModule, SettingsModule],
  providers: [JobBus, PythonRunnerService],
  exports: [JobBus, PythonRunnerService],
})
export class PythonModule {}
