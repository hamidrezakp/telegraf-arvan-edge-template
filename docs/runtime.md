# Runtime and compatibility

## Request flow

1. Match endpoint and method.
2. Validate `env.config`.
3. For POST, verify the secret and parse the update; then create/reuse the bot.
4. Register `https://<EC_URL>/webhook` when enabled and a domain is available.
5. For POST, resolve `getMe`, then await `bot.handleUpdate(update)`.
6. Return `200`, or `502` on setup/handler/API failure.

Registration and `getMe` share in-flight promises across concurrent requests.
Failed calls are retried on the next request. Successful results last only for
the current worker/configuration. The registration flag skips `setWebhook`,
not `getMe`; identity is fetched once per cold worker handling updates.

Handlers have no adapter timeout: a timer cannot cancel a handler safely.
The platform's execution limits still apply. Keep work short and await it.

## Build strategy

esbuild emits one ES module with a default `{ fetch(request) }` export.
Telegraf, user code, and adapters are bundled; there are no external imports.

The build replaces only Telegraf's internal Node-dependent modules:

| Module | Replacement |
| --- | --- |
| API client | Web fetch, JSON, FormData, TelegramError |
| Polling / Node webhook server | Explicit unsupported-operation errors |
| Node URL/path helpers | Web URL and absolute-path detection |
| Debug logging | No-op to avoid runtime-specific logging dependencies |
| Internal `process.env` access | Empty object; user config stays in `env.config` |

Telegraf's actual Composer, Context, handlers, Telegram methods, and update
dispatcher remain in use. `node_modules` is never modified. The build checks
the pinned Telegraf version and expected environment-helper source.

## Supported boundaries

- Commands, middleware, filters, callbacks, Markup, and ordinary Telegram API methods.
- JSON payloads; nested multipart uploads, media groups, thumbnails.
- `TelegramError` code/description/parameters for API failures.
- Web APIs in user code; browser-compatible dependencies that esbuild can bundle.
- `bot.telegram` and `ctx.telegram` both use the Web transport.

Not supported:

- `launch`, polling, Node webhook callbacks/servers, `stop`, secret-path generation.
- Node filesystem, sockets, streams, or Node-only user dependencies.
- Webhook-reply optimization; every API request is awaited for its result.
- Durable storage, scheduled/background tasks, automatic duplicate suppression.
- General Node polyfills. Telegraf features outside the tested paths may need review.

## Verification and upgrades

```bash
npm ci
npm test
npm run deploy -- YOUR_TEST_APP
```

Tests load the deployment artifact in a VM without Node globals or external
imports. They cover auth, invalid input/config, commands, callbacks, uploads,
API failures, registration/identity retries, configuration changes, and cold
module registration behavior. Transport tests cover media groups and Telegram
error compatibility.

Before upgrading Telegraf, inspect its internal module layout and transport
contract, update the build version guard, run tests, then check `/start`, inline
buttons, text, `/file`, and a cold start on Edge. Keep `package-lock.json` checked
in for reproducible dependency resolution.
