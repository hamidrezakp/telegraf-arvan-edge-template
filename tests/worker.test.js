import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('bundled Telegraf runs without Node globals', async () => {
  const calls = [];
  let failReply = false;
  let failSetup = false;
  let failIdentity = false;
  const context = vm.createContext({
    Request, Response, Headers, URL, Blob, FormData, TextEncoder, ArrayBuffer, Uint8Array,
    setTimeout, clearTimeout, console: { error() {} },
    env: { EC_URL: 'example.user.arvanedge.ir', config: {
      bot_token: '123:test', webhook_secret: 'test-secret', webhook_registered: false,
    } },
    fetch: async (url, init) => {
      const method = url.split('/').at(-1);
      calls.push({ method, body: init.body instanceof FormData ? init.body : JSON.parse(init.body) });
      if ((failSetup && method === 'setWebhook') || (failIdentity && method === 'getMe')) {
        return Response.json({ ok: false, error_code: 503 }, { status: 503 });
      }
      if (failReply && method === 'sendMessage') return Response.json({ ok: false, error_code: 429 });
      return Response.json({ ok: true, result: method === 'getMe'
        ? { id: 123, is_bot: true, first_name: 'Test Bot', username: 'test_bot' }
        : true });
    },
  });
  const module = new vm.SourceTextModule(await readFile('out/telegram-bot.js', 'utf8'), { context });
  await module.link(() => { throw new Error('Bundle must not import external modules'); });
  await module.evaluate();
  const worker = module.namespace.default;
  const send = (update, secret = 'test-secret') => worker.fetch(new Request('https://example.user.arvanedge.ir/webhook', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': secret }, body: JSON.stringify(update),
  }));
  const message = (text) => ({ update_id: 1, message: {
    message_id: 2, date: 1, chat: { id: 42, type: 'private' }, from: { id: 42, first_name: 'Tester' }, text,
    ...(text.startsWith('/') ? { entities: [{ type: 'bot_command', offset: 0, length: text.length }] } : {}),
  } });
  assert.equal((await send(message('hello'), 'wrong')).status, 401);
  assert.equal(calls.length, 0);
  assert.equal((await worker.fetch(new Request('https://example.user.arvanedge.ir/'))).status, 200);
  assert.deepEqual(calls[0], { method: 'setWebhook', body: {
    url: 'https://example.user.arvanedge.ir/webhook', secret_token: 'test-secret',
  } });
  for (const text of ['/start', 'hello', '/file']) assert.equal((await send(message(text))).status, 200);
  assert.equal(calls.filter((call) => call.method === 'getMe').length, 1);
  assert.ok(calls.some((call) => call.body.text === 'Echo: hello'));
  const document = calls.find((call) => call.method === 'sendDocument').body;
  const attachment = document.get('document').slice('attach://'.length);
  assert.equal(JSON.parse(await document.get(attachment).text()).message.text, '/file');
  assert.equal((await send({ update_id: 2, callback_query: {
    id: 'callback-1', from: { id: 42, first_name: 'Tester' }, chat_instance: 'chat', data: 'ping', message: message('button').message,
  } })).status, 200);
  assert.ok(calls.some((call) => call.method === 'answerCallbackQuery'));
  failReply = true;
  assert.equal((await send(message('fail'))).status, 502);
  context.env.config.webhook_registered = true;
  failReply = false;
  assert.equal((await send(message('after flag change'))).status, 200);
  assert.equal(calls.filter((call) => call.method === 'setWebhook').length, 1);

  // New runtime configurations must not reuse stale registration or identity.
  context.env.config.webhook_registered = false;
  context.env.EC_URL = 'new.user.arvanedge.ir';
  failSetup = true;
  assert.equal((await send(message('retry registration'))).status, 502);
  failSetup = false;
  failIdentity = true;
  assert.equal((await send(message('retry identity'))).status, 502);
  failIdentity = false;
  const replies = await Promise.all([send(message('one')), send(message('two'))]);
  assert.ok(replies.every((reply) => reply.status === 200));
  assert.equal(calls.filter((call) => call.method === 'setWebhook' && call.body.url.includes('new.user')).length, 2);

  const before = calls.length;
  for (const config of [null, [], '{}', {}, { bot_token: 'token', webhook_secret: '' }, { bot_token: 'token', webhook_secret: 'invalid!' }]) {
    context.env.config = config;
    assert.equal((await send(message('invalid config'))).status, 500);
  }
  assert.equal(calls.length, before);
  context.env.config = { bot_token: '123:test', webhook_secret: 'test-secret', webhook_registered: true };
  assert.equal((await send(null)).status, 400);
  assert.equal((await send([])).status, 400);
  assert.equal((await worker.fetch(new Request('https://example.test/webhook', {
    method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'test-secret' }, body: '{',
  }))).status, 400);
  assert.equal((await worker.fetch(new Request('https://example.test/health', { method: 'POST' }))).status, 405);
  assert.equal((await worker.fetch(new Request('https://example.test/missing'))).status, 404);

  // A completely fresh module must honor the persisted registration flag.
  const coldModule = new vm.SourceTextModule(await readFile('out/telegram-bot.js', 'utf8'), { context });
  await coldModule.link(() => { throw new Error('External import'); });
  await coldModule.evaluate();
  const previousRegistrations = calls.filter((call) => call.method === 'setWebhook').length;
  assert.equal((await coldModule.namespace.default.fetch(new Request('https://example.test/'))).status, 200);
  assert.equal(calls.filter((call) => call.method === 'setWebhook').length, previousRegistrations);
});
