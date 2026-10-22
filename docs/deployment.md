# Deployment

## 1. Configure

Create a bot using Telegram's [@BotFather](https://t.me/BotFather).
In your Edge application, add a JSON object named `config`:

```json
{
  "bot_token": "123456:replace-this",
  "webhook_secret": "replace-with-a-random-secret",
  "webhook_registered": false
}
```

| Field | Requirement |
| --- | --- |
| `bot_token` | Required, non-empty BotFather token |
| `webhook_secret` | Required, 1–256 characters: `A–Z`, `a–z`, `0–9`, `_`, `-` |
| `webhook_registered` | `true` skips registration; unset/`false` enables it. String `"true"` is also accepted. |
| Custom fields | Available through `setupBot(bot, { config })` |

Generate a secret locally:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

The runtime reads `globalThis.env.config` and platform-provided
`globalThis.env.EC_URL` (e.g. `example.user.arvanedge.ir`). Keep secrets in the
dashboard; build and deployment scripts do not load them.

## 2. Build and deploy

```bash
npm ci
npm test
npm run deploy -- YOUR_APP
```

Equivalent manual deployment:

```bash
npm run build
arvan ec deploy -f out/telegram-bot.js YOUR_APP
```

## 3. Register once

Open `https://YOUR_DOMAIN/` using VPN. With registration enabled, the worker
awaits Telegram's `setWebhook` response. HTTP `200` means registration succeeded;
HTTP `502` means retry after resolving the failure.

**Set `config.webhook_registered` to `true` after success.** The worker cannot
persist this flag. Without it, each cold worker registers again.

For an existing webhook with the same URL and secret, use `true` immediately.
When the token, secret, or domain changes: set `false`, open `/`, then set `true`.
Code-only redeployments do not require registration.

Manual registration (shell variables are only for these commands):

```bash
curl "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  --data-urlencode "url=https://${EC_URL}/webhook" \
  --data-urlencode "secret_token=${WEBHOOK_SECRET}"
```

Use the same secret as `config.webhook_secret`, then set the flag to `true`.

## 4. Verify

```bash
curl "https://${EC_URL}/health"
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"
```

Send `/start`, press its button, send text, then `/file`. Wait 15 seconds and
send another message to verify a cold start.

## Endpoints

| Request | Result |
| --- | --- |
| `GET /`, `/health`, `/webhook` | Validate config, register if enabled, return `{"status":"ok"}` |
| `POST /webhook` | Authenticate, parse, await Telegraf handlers |
| Other methods on known paths | `405` |
| Unknown paths | `404` |

GET endpoints do not call `getMe`; they do not verify the bot token if registration
is skipped. Only `/webhook` accepts updates.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `500` | JSON object config, token, secret format, synchronous handler setup |
| `401` | Telegram's registered secret must match `config.webhook_secret` |
| `400` | Valid JSON object with integer `update_id` |
| `502` | Telegram availability, token, handler errors, outbound fetch, API rate limits |
| No updates | `getWebhookInfo`, correct domain, `/webhook` path |
| Repeated registration | Set the registration flag to `true` |
| Duplicate replies | Telegram retries; there is no durable deduplication |
| Lost sessions | Worker memory disappears after idle shutdown |

The wrapper logs a generic failure message to avoid exposing tokens or updates.
For diagnostics, log only the fields you need inside handlers; avoid raw fetch
errors, config, and complete updates containing user data.
