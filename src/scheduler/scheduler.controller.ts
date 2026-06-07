import {
  Controller,
  Post,
  Headers,
  HttpCode,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContentService } from '../content/content.service';
import { TelegramService } from '../telegram/telegram.service';

@Controller('scheduler')
export class SchedulerController {
  private readonly logger = new Logger(SchedulerController.name);

  constructor(
    private configService: ConfigService,
    private contentService: ContentService,
    private telegramService: TelegramService,
  ) {}

  // Manual trigger endpoint — useful for testing without redeploying
  @Post('trigger')
  @HttpCode(200)
  async trigger(@Headers('authorization') auth: string) {
    const secret = this.configService.get<string>('telegram.schedulerSecret');

    if (secret && auth !== `Bearer ${secret}`) {
      this.logger.warn(`Rejected trigger — bad auth header`);
      throw new UnauthorizedException('Invalid scheduler secret');
    }

    this.logger.log('Manual trigger received — generating drafts');

    try {
      const batch = await this.contentService.generateDrafts();
      await this.telegramService.sendDrafts(batch);
      this.logger.log(`Manual trigger done | pillar=${batch.pillar} | topic="${batch.topic}"`);
      return { ok: true, topic: batch.topic, pillar: batch.pillar };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Manual trigger failed: ${msg}`, err instanceof Error ? err.stack : undefined);
      return { ok: false, error: msg };
    }
  }
}
