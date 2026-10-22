import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const telegraf = dirname(require.resolve('telegraf'));
const version = JSON.parse(await readFile(resolve(telegraf, '../package.json'), 'utf8')).version;
if (version !== '4.16.3') throw new Error('Review the Edge adapter before upgrading Telegraf from 4.16.3');
const substitutions = new Map([
  [resolve(telegraf, 'core/network/client.js'), 'client.js'],
  [resolve(telegraf, 'core/network/polling.js'), 'compat/unsupported.js'],
  [resolve(telegraf, 'core/network/webhook.js'), 'compat/unsupported.js'],
]);

const result = await build({
  entryPoints: [resolve(root, 'src/index.js')],
  outfile: resolve(root, 'out/telegram-bot.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  metafile: true,
  logLevel: 'info',
  plugins: [{
    name: 'telegraf-web-runtime',
    setup(build) {
      build.onLoad({ filter: /telegraf\/lib\/core\/helpers\/util\.js$/ }, async ({ path }) => {
        const source = await readFile(path, 'utf8');
        if (!source.includes('exports.env = process.env;')) throw new Error('Telegraf environment adapter needs review');
        return { contents: source.replace('exports.env = process.env;', 'exports.env = {};'), loader: 'js' };
      });
      build.onResolve({ filter: /^(http|https|crypto|safe-compare|debug|url|path)$/ }, ({ path, importer }) => {
        if (!importer.startsWith(telegraf + '/')) return;
        return { path: resolve(root, 'edge/compat', path === 'debug' ? 'debug.js' : ['url', 'path'].includes(path) ? 'web-globals.js' : 'unsupported.js') };
      });
      build.onResolve({ filter: /^\./ }, ({ path, importer }) => {
        if (!importer.startsWith(telegraf + '/')) return;
        const replacement = substitutions.get(resolve(dirname(importer), path + (path.endsWith('.js') ? '' : '.js')));
        if (replacement) return { path: resolve(root, 'edge', replacement) };
      });
    },
  }],
});
if (Object.values(result.metafile.outputs).some((output) => output.imports.length)) {
  throw new Error('The Edge bundle must not have external imports');
}
