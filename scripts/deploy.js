import { spawnSync } from 'node:child_process';

const [app, ...extra] = process.argv.slice(2);
if (!app || app.startsWith('-') || extra.length) {
  console.error('Usage: npm run deploy -- YOUR_APP');
  process.exit(1);
}
await import('./build.js');
const result = spawnSync('arvan', ['ec', 'deploy', '-f', 'out/telegram-bot.js', app], { stdio: 'inherit' });
if (result.error) console.error('Unable to run arvan. Install and authenticate the ArvanCloud CLI.');
process.exitCode = result.status ?? 1;
