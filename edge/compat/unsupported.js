export function unsupported() {
  throw new Error('This Node-only Telegraf feature is unavailable on Edge; use handleUpdate through the wrapper');
}
export const createServer = unsupported;
export const createHash = unsupported;
export const randomBytes = unsupported;
export const Polling = unsupported;
export default unsupported;
