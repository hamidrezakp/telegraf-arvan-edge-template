import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TelegramError } from 'telegraf';
import Client from '../edge/client.js';

test('Web API transport preserves uploads, errors, and options', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const client = new Client('123:secret', { testEnv: true });
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, ...init };
    return Response.json({ ok: true, result: { message_id: 1 } });
  };
  await client.callApi('sendMediaGroup', {
    chat_id: 42,
    media: [{ type: 'photo', media: { source: new Uint8Array([1, 2]), filename: 'photo.jpg' } },
      { type: 'photo', media: 'existing-file-id' }],
  });
  assert.match(request.url, /\/bot123:secret\/test\/sendMediaGroup$/);
  const media = JSON.parse(request.body.get('media'));
  assert.equal(media[1].media, 'existing-file-id');
  assert.equal(request.body.get(media[0].media.slice(9)).name, 'photo.jpg');
  assert.equal(request.headers['Content-Type'], undefined);
  await assert.rejects(client.callApi('sendDocument', { document: { source: '/etc/file' } }), /Edge uploads/);
  await assert.rejects(client.callApi('sendDocument', { document: { url: 'https://example.test', filename: undefined } }), /fromURLStream/);
  globalThis.fetch = async () => Response.json({ ok: false, error_code: 429, description: 'Too Many Requests', parameters: { retry_after: 3 } });
  await assert.rejects(client.callApi('sendMessage', {}), (error) => {
    assert.ok(error instanceof TelegramError);
    assert.equal(error.code, 429);
    assert.equal(error.parameters.retry_after, 3);
    return true;
  });
  globalThis.fetch = async () => { throw new Error('https://api.telegram.org/bot123:secret/sendMessage'); };
  await assert.rejects(client.callApi('sendMessage'), (error) => !error.message.includes('123:secret'));
});
