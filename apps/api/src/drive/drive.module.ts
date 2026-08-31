import { Global, Module } from '@nestjs/common';
import { DriveMirrorService } from './drive-mirror.service';

@Global()
@Module({
  providers: [DriveMirrorService],
  exports: [DriveMirrorService],
})
export class DriveModule {}
