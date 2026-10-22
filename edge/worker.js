import { Telegraf } from 'telegraf';

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

function readConfig() {
  const config = globalThis.env?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('config must be a JSON object');
  if (typeof config.bot_token !== 'string' || !config.bot_token.trim()) throw new Error('config.bot_token is required');
  if (typeof config.webhook_secret !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(config.webhook_secret)) {
    throw new Error('config.webhook_secret must contain 1–256 letters, digits, underscores, or hyphens');
  }
  return config;
}

/** Adapt synchronous Telegraf handler setup to an ArvanCloud fetch worker. */
export function createWorker(setupBot) {
  let current;

  function getRuntime(config) {
    const domain = globalThis.env.EC_URL;
    const key = JSON.stringify([config, domain]);
    if (current?.key === key) return current;
    const bot = new Telegraf(config.bot_token.trim(), {
      telegram: { webhookReply: false }, handlerTimeout: Infinity,
    });
    // Avoid Telegraf's default Node process.exitCode error handler.
    bot.catch((error) => { throw error; });
    for (const method of ['launch', 'stop', 'webhookCallback', 'createWebhook', 'secretPathComponent']) {
      bot[method] = () => { throw new Error(`${method} is managed by the Edge wrapper`); };
    }
    const setupResult = setupBot(bot, { config });
    if (setupResult?.then) {
      // Consume a possible rejection before reporting the unsupported setup.
      Promise.resolve(setupResult).catch(() => {});
      throw new Error('setupBot must synchronously register handlers');
    }
    current = { key, bot, config, domain, registration: undefined, identity: undefined };
    return current;
  }

  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (!['/', '/health', '/webhook'].includes(path)) return json({ error: 'Not found' }, 404);
      if (request.method !== 'GET' && !(request.method === 'POST' && path === '/webhook')) {
        return json({ error: 'Method not allowed' }, 405);
      }
      let config;
      try { config = readConfig(); } catch (error) { return json({ error: error.message }, 500); }
      let update;
      if (request.method === 'POST') {
        if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== config.webhook_secret) {
          return json({ error: 'Unauthorized' }, 401);
        }
        try { update = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
        if (!update || Array.isArray(update) || !Number.isInteger(update.update_id)) {
          return json({ error: 'Invalid update' }, 400);
        }
      }
      let runtime;
      try { runtime = getRuntime(config); } catch {
        console.error('Telegraf handler setup failed');
        return json({ error: 'Unable to initialize bot handlers' }, 500);
      }
      const { bot, domain } = runtime;
      try {
        if (domain && config.webhook_registered !== true && config.webhook_registered !== 'true') {
          if (typeof domain !== 'string' || !/^[A-Za-z0-9.-]+$/.test(domain)) throw new Error('Invalid EC_URL');
          runtime.registration ??= bot.telegram.setWebhook(`https://${domain}/webhook`, {
            secret_token: config.webhook_secret,
          }).catch((error) => { runtime.registration = undefined; throw error; });
          await runtime.registration;
        }
        if (request.method === 'GET') return json({ status: 'ok' });
        // Identity is independent of registration and lasts only for this worker.
        runtime.identity ??= bot.telegram.getMe().catch((error) => { runtime.identity = undefined; throw error; });
        bot.botInfo = await runtime.identity;
        await bot.handleUpdate(update);
        return json({ ok: true });
      } catch {
        // Never expose fetch errors containing the token or incoming update data.
        console.error('Telegraf Edge request failed');
        return json({ error: 'Telegram setup or update handling failed' }, 502);
      }
    },
  };
}
