// Build-time replacement for Telegraf 4.16.3's Node API transport.
import { TelegramError } from 'telegraf';

export default class WebApiClient {
  constructor(token, options = {}) {
    this.token = token;
    this.options = { apiRoot: 'https://api.telegram.org', apiMode: 'bot', ...options, webhookReply: false };
  }

  get webhookReply() { return false; }
  set webhookReply(value) {
    if (value) throw new Error('Webhook replies are disabled on Edge; API calls are awaited');
  }

  async callApi(method, payload = {}, { signal } = {}) {
    const files = [];
    const names = new Set(Object.keys(payload));
    const encode = (value) => {
      if (value == null) return undefined;
      if (typeof value !== 'object') return value;
      if ('source' in value) {
        const source = value.source;
        if (!(source instanceof Blob) && !(source instanceof ArrayBuffer) && !ArrayBuffer.isView(source)) {
          throw new Error('Edge uploads require Blob, ArrayBuffer, or Uint8Array sources');
        }
        let name = `upload${files.length}`;
        while (names.has(name)) name = `_${name}`;
        names.add(name);
        files.push([name, source instanceof Blob ? source : new Blob([source]), value.filename || 'file.dat']);
        return `attach://${name}`;
      }
      if ('url' in value && 'filename' in value) {
        throw new Error('Input.fromURLStream is unsupported; fetch the URL and pass a Blob source');
      }
      if (Array.isArray(value)) return value.map(encode);
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
    };
    const data = encode(payload);
    let body = JSON.stringify(data);
    const headers = {};
    if (files.length) {
      body = new FormData();
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      for (const [name, blob, filename] of files) body.set(name, blob, filename);
    } else {
      headers['Content-Type'] = 'application/json';
    }
    let response;
    try {
      response = await fetch(`${this.options.apiRoot}/${this.options.apiMode}${this.token}${this.options.testEnv ? '/test' : ''}/${method}`, { method: 'POST', headers, body, signal });
    } catch {
      throw new Error(`Telegram ${method} network request failed`);
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok !== true) {
      throw new TelegramError({
        error_code: result?.error_code || response.status,
        description: result?.description || 'Invalid Telegram API response',
        parameters: result?.parameters,
      }, { method });
    }
    return result.result;
  }
}
