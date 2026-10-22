# Telegraf × ArvanCloud Edge

Write Telegraf handlers. Build one JavaScript module. Deploy to ArvanCloud Edge
Computing. The adapter handles webhooks, authentication, and Telegram transport.

## Quick start

Requires Node.js 18+ and an authenticated `arvan` CLI.

```bash
npm ci
# Edit src/bot.js
npm test
npm run deploy -- YOUR_APP
```

In the Edge dashboard, create a **JSON object** environment variable named
`config`:

```json
{
  "bot_token": "123456:your-bot-token",
  "webhook_secret": "your-random-secret",
  "webhook_registered": false
}
```

1. Open `https://YOUR_DOMAIN/` (using VPN to call EC on non-iran
   servers) once to register the webhook.
2. On HTTP `200`, set `config.webhook_registered` to `true` in the dashboard.
3. Send `/start` to your bot.

ArvanCloud supplies `env.EC_URL`. The callback is `https://<EC_URL>/webhook`.
No domain, token, or secret is embedded in the bundle.

## Write your bot

Edit **`src/bot.js`**:

```js
export function setupBot(bot, { config }) {
  bot.start((ctx) => ctx.reply('Hello!'));
  bot.command('ping', (ctx) => ctx.reply('Pong'));
  bot.on('text', (ctx) => ctx.reply(ctx.message.text));
}
```

Register handlers synchronously. Return or await every asynchronous operation.
The adapter owns startup: do not call `bot.launch()`.

The included example supports `/start`, an inline callback button, `/file`, and
text echo. Replace it with your handlers.

## Commands

| Command | Result |
| --- | --- |
| `npm run build` | Bundle into `out/telegram-bot.js` |
| `npm test` | Build and test the actual bundle without Node globals |
| `npm run deploy -- YOUR_APP` | Build, then deploy using `arvan ec deploy` |
| `npm run dev` | Build and serve locally at `127.0.0.1:8787` |

## Layout

```text
src/bot.js           Your handlers
src/index.js         Worker entry point
edge/worker.js       Config, authentication, registration, update dispatch
edge/client.js       Web fetch / multipart Telegram transport
edge/compat/         Build-time Node compatibility replacements
scripts/            Build, deploy, local server
tests/              Transport and isolated-bundle tests
out/telegram-bot.js  Deployment artifact (ignored by Git)
```

## Guides

- [Deployment, configuration, troubleshooting](docs/deployment.md)
- [Handlers, uploads, local development](docs/bot-development.md)
- [Runtime design and compatibility](docs/runtime.md)

Telegraf 4.16.3 is pinned. The initial adapter was tested on ArvanCloud with
commands, callbacks, uploads, and cold starts. Review the adapter and rerun Edge
smoke tests when upgrading dependencies.
