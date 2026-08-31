import { Global, Module } from '@nestjs/common';
import { MirrorQueue } from './mirror.queue';

@Global()
@Module({
  providers: [MirrorQueue],
  exports: [MirrorQueue],
})
export class JobsModule {}
