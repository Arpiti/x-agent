export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  gemini: {
    project: process.env.GOOGLE_CLOUD_PROJECT,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'asia-south1',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    webhookDomain: process.env.WEBHOOK_DOMAIN,
    schedulerSecret: process.env.SCHEDULER_SECRET,
  },
});
