import { Global, Module } from '@nestjs/common';
import { KYSELY, createKysely } from './kysely.provider';

@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      useFactory: createKysely,
    },
  ],
  exports: [KYSELY],
})
export class DbModule {}
