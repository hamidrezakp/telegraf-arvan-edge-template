import { Markup } from 'telegraf';

// User-defined bot logic. The wrapper owns configuration and delivery.
export function setupBot(bot) {
  bot.start((ctx) => ctx.reply('Telegraf on ArvanCloud Edge is running!',
    Markup.inlineKeyboard([Markup.button.callback('Ping', 'ping')])));
  bot.action('ping', async (ctx) => {
    await ctx.answerCbQuery('Pong from Edge');
    await ctx.reply('Callback handled.');
  });
  bot.command('file', (ctx) => ctx.replyWithDocument({
    source: new TextEncoder().encode(JSON.stringify(ctx.update, null, 2)),
    filename: 'update.json',
  }));
  bot.on('text', (ctx) => ctx.reply(`Echo: ${ctx.message.text}`));
}
