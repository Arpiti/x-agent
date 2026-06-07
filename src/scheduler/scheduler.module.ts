import { Module } from '@nestjs/common';
import { SchedulerController } from './scheduler.controller';
import { ContentModule } from '../content/content.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [ContentModule, TelegramModule],
  controllers: [SchedulerController],
})
export class SchedulerModule {}
