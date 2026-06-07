import { Controller, Post, Body, Headers, HttpCode, UnauthorizedException } from '@nestjs/common';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  // Telegram sends all user messages here (webhook mode, production)
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Body() body: any) {
    await this.telegramService.processWebhookUpdate(body);
    return { ok: true };
  }
}
