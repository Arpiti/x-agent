import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { ContentService, DraftBatch, Pillar } from '../content/content.service';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf;
  private chatId: string;

  constructor(
    private configService: ConfigService,
    private contentService: ContentService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('telegram.botToken');
    const webhookDomain = this.configService.get<string>('telegram.webhookDomain');
    this.chatId = this.configService.get<string>('telegram.chatId');

    if (!token) this.logger.error('TELEGRAM_BOT_TOKEN is not set');
    if (!this.chatId) this.logger.error('TELEGRAM_CHAT_ID is not set');

    this.bot = new Telegraf(token ?? '');
    this.registerCommands();

    // Catch all unhandled errors inside Telegraf middleware
    this.bot.catch((err, ctx) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Unhandled Telegraf error for update ${ctx.updateType}: ${msg}`, err instanceof Error ? err.stack : undefined);
    });

    try {
      if (webhookDomain) {
        await this.bot.telegram.setWebhook(`${webhookDomain}/telegram/webhook`);
        this.logger.log(`Webhook set: ${webhookDomain}/telegram/webhook`);
      } else {
        this.bot.launch();
        this.logger.log('Bot started in polling mode (local dev)');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Bot init failed: ${msg}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  async onModuleDestroy() {
    if (this.bot) this.bot.stop('SIGTERM');
  }

  private registerCommands() {
    this.bot.command('generate', async (ctx) => {
      const args = ctx.message.text.split(' ').slice(1).join(' ').trim();
      this.logger.log(`/generate received | args="${args}" | from=${ctx.from?.id}`);

      await ctx.reply('Generating drafts...');

      try {
        const batch = await this.contentService.generateDrafts(args || undefined);
        await this.sendDrafts(batch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`/generate failed: ${msg}`, err instanceof Error ? err.stack : undefined);
        await ctx.reply(`Draft generation failed:\n${msg}`);
      }
    });

    this.bot.command('start', (ctx) => {
      ctx.reply(
        `X Agent active.\n\n` +
        `Commands:\n` +
        `/generate — agent picks a topic\n` +
        `/generate [topic] — generate on your topic\n\n` +
        `Scheduled: 8AM, 7PM, 11PM IST`,
      );
    });

    this.bot.command('help', (ctx) => {
      ctx.reply(
        `Commands:\n` +
        `/generate — agent picks topic from your pillars\n` +
        `/generate [topic] — use your own topic\n\n` +
        `Pillars: build_story, system_design, propertygauss\n` +
        `Scheduled: 8AM, 7PM, 11PM IST`,
      );
    });
  }

  async processWebhookUpdate(body: any) {
    this.logger.debug(`Webhook update received: ${JSON.stringify(body).slice(0, 100)}`);
    try {
      await this.bot.handleUpdate(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`handleUpdate failed: ${msg}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }

  async sendDrafts(batch: DraftBatch) {
    const signalLabel: Record<string, string> = {
      dwell_driver: 'dwell',
      reply_driver: 'reply',
      follow_driver: 'follow',
      repost_driver: 'repost',
    };

    const pillarLabel: Record<string, string> = {
      build_story: 'Build Story',
      system_design: 'System Design',
      propertygauss: 'PropertyGauss',
    };

    // Header message — topic + pillar context
    await this.sendMessage(
      `Pillar: ${pillarLabel[batch.pillar] ?? batch.pillar}\nTopic: ${batch.topic}`,
    );

    // One message per draft
    for (let i = 0; i < batch.drafts.length; i++) {
      const draft = batch.drafts[i];
      const signal = signalLabel[draft.signal] ?? draft.signal;

      let msg: string;

      if (draft.type === 'thread') {
        const tweets = draft.content.split('---').map((t) => t.trim()).filter(Boolean);
        msg = `Draft ${i + 1}/3 · Thread [${signal}]\n\n`;
        tweets.forEach((tweet, j) => {
          msg += `${j + 1}/${tweets.length}\n${tweet}\n\n`;
        });
        msg = msg.trimEnd();
      } else {
        const charCount = draft.content.length;
        const overLimit = charCount > 280;
        msg = `Draft ${i + 1}/3 · Single [${signal}] · ${charCount}/280${overLimit ? ' ⚠️ over limit' : ''}\n\n${draft.content}`;
      }

      await this.sendMessage(msg);
    }

    this.logger.log(`Drafts sent (${batch.drafts.length} messages) to chat ${this.chatId}`);
  }

  private async sendMessage(text: string) {
    try {
      await this.bot.telegram.sendMessage(this.chatId, text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendMessage failed: ${msg}`, err instanceof Error ? err.stack : undefined);
      throw err;
    }
  }
}
