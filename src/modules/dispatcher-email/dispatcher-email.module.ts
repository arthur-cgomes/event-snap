import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DispatcherEmailService } from './dispatcher-email.service';

@Module({
  imports: [ConfigModule],
  providers: [DispatcherEmailService],
  exports: [DispatcherEmailService],
})
export class DispatcherEmailModule {}
