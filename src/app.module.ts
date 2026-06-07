import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramModule } from './telegram/telegram.module';
import { ContentModule } from './content/content.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import configuration from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ContentModule,
    TelegramModule,
    SchedulerModule,
  ],
})
export class AppModule {}
