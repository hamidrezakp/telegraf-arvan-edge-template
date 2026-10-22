# Bot development

## Handlers and middleware

`src/bot.js` exports a synchronous `setupBot(bot, { config })` function. It runs
once per worker configuration. Use Telegraf's normal middleware API:

```js
import { Markup } from 'telegraf';
import { message } from 'telegraf/filters';

export function setupBot(bot, { config }) {
  bot.use(async (ctx, next) => {
    ctx.state.greeting = config.greeting || 'Hello';
    await next();
  });
  bot.start((ctx) => ctx.reply(ctx.state.greeting,
    Markup.inlineKeyboard([Markup.button.callback('Ping', 'ping')])));
  bot.action('ping', (ctx) => ctx.answerCbQuery('Pong'));
  bot.on(message('text'), (ctx) => ctx.reply(ctx.message.text));
}
```

Register specific handlers before broad handlers. Middleware that should pass
control onward must call `next()`. Use `ctx.state` for request-local data.

## Files

File IDs and public URL strings work directly:

```js
await ctx.replyWithPhoto('https://example.com/photo.jpg');
await ctx.replyWithDocument(existingFileId);
```

Upload a Blob, ArrayBuffer, or typed array:

```js
await ctx.replyWithDocument({
  source: new TextEncoder().encode(JSON.stringify({ hello: 'world' })),
  filename: 'data.json',
});
```

To fetch a file yourself:

```js
const response = await fetch('https://example.com/file.pdf');
if (!response.ok) throw new Error('Download failed');
await ctx.replyWithDocument({ source: await response.blob(), filename: 'file.pdf' });
```

Media groups and thumbnails may contain the same source objects. Uploads are
buffered in memory: respect runtime memory and Telegram file-size limits.
Local file paths, Node streams, and `Input.fromURLStream` are unsupported.

## API errors

Telegram errors retain Telegraf's `TelegramError` type, `.code`, and `.parameters`:

```js
import { TelegramError } from 'telegraf';

bot.command('example', async (ctx) => {
  try {
    await ctx.reply('Hello');
  } catch (error) {
    if (error instanceof TelegramError) console.error('Telegram error', error.code);
    throw error; // Wrapper returns 502 so Telegram can retry.
  }
});
```

Uncaught errors return `502`. A custom `bot.catch` that swallows an error makes
the update successful (`200`). No automatic rate-limit sleeps or retries occur.
Always return/await calls; background work is not guaranteed to finish.

## Local development

```bash
export CONFIG='{"bot_token":"123456:replace-this","webhook_secret":"local-secret","webhook_registered":true}'
npm run dev
```

The server uses `127.0.0.1:8787`. It builds before starting; restart after edits.
No `.env` loading or port override. `CONFIG` is parsed into `env.config`;
optional `EC_URL` is mapped unchanged. Leave `EC_URL` unset for local testing.

Health check:

```bash
curl http://127.0.0.1:8787/health
```

Send a synthetic update using a real chat ID that has started your bot:

```bash
curl http://127.0.0.1:8787/webhook \
  -H 'Content-Type: application/json' \
  -H 'X-Telegram-Bot-Api-Secret-Token: local-secret' \
  -d '{"update_id":1,"message":{"message_id":1,"date":0,"chat":{"id":YOUR_CHAT_ID,"type":"private"},"text":"hello"}}'
```

This makes real Telegram API calls. `npm test` uses mocks and needs no token.

## State

Worker instances are short-lived and may run concurrently. Use an external
store for durable sessions, conversation state, scheduled work, or idempotency.
Telegraf's default in-memory session store is not durable. Scenes require a
suitable session store; this template does not provide one.
