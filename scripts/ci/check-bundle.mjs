/**
 * Bundle guard (modularity task F4, owner decision 2026-11-08). Run after `vite build`:
 *
 *   node scripts/ci/check-bundle.mjs [--dist dist] [--update]
 *
 * 1. Main bundle budget: the entry chunk named by dist/index.html (what every page downloads
 *    first) may not grow past .ci/baselines/bundle.json `mainChunkBytes` + `marginBytes`. On
 *    2026-11-07 the F4 moves had doubled it (732 KB -> 1,479 KB) with every test green.
 *    `--update` records the current size (a deliberate growth is reviewed in the PR diff).
 * 2. Lazy chunks stay lazy: the entry chunk or a route page chunk that loads another with
 *    `import("./X-hash.js")` must not also import it statically (`from"./X-hash.js"`); that
 *    would download it with the page. On
 *    2026-11-08 an `export { type T } from` in a feature index did exactly that to the board view.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const argValue = (name, fallback) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const root = process.cwd();
const dist = join(root, argValue('--dist', 'dist'));
const baselinePath = join(root, '.ci/baselines/bundle.json');

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`✗ No ${join(dist, 'index.html')}: run \`npx vite build\` first.`);
  process.exit(1);
}
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const entryPath = /<script[^>]+type="module"[^>]+src="\/?([^"]+\.js)"/.exec(html)?.[1];
if (!entryPath) {
  console.error('✗ No module script in dist/index.html.');
  process.exit(1);
}
const mainBytes = readFileSync(join(dist, entryPath)).length;

const assets = join(dist, 'assets');
const chunks = readdirSync(assets).filter((name) => name.endsWith('.js'));
// Checked importers: the entry chunk and the route pages (`*Page-hash.js`), whose lazy chunks are
// what a page load avoids. (Inside an already-lazy chunk a redundant import() is harmless.)
const isPageOrEntry = (name) => `assets/${name}` === entryPath || /^[A-Z][A-Za-z]*Page-/.test(name);
const eager = [];
for (const name of chunks.filter(isPageOrEntry)) {
  const code = readFileSync(join(assets, name), 'utf8');
  const lazy = new Set(
    [...code.matchAll(/import\(\s*"\.\/([^"]+\.js)"\s*\)/g)].map((match) => match[1])
  );
  const statics = new Set(
    [...code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map((match) => match[1])
  );
  for (const target of lazy) if (statics.has(target)) eager.push(`${name} -> ${target}`);
}

if (process.argv.includes('--update')) {
  mkdirSync(dirname(baselinePath), { recursive: true });
  const marginBytes = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, 'utf8')).marginBytes
    : 8192;
  writeFileSync(
    baselinePath,
    `${JSON.stringify({ mainChunkBytes: mainBytes, marginBytes }, null, 2)}\n`
  );
  console.log(`Baseline written: main chunk ${mainBytes} B (margin ${marginBytes} B).`);
  process.exit(0);
}

const { mainChunkBytes, marginBytes } = JSON.parse(readFileSync(baselinePath, 'utf8'));
let failed = false;
if (mainBytes > mainChunkBytes + marginBytes) {
  failed = true;
  console.error(
    `✗ Main chunk ${entryPath} is ${mainBytes} B, over the budget ${mainChunkBytes} + ${marginBytes} B.\n` +
      '  Something every page loads now pulls in more code. Find it with `npx vite build --sourcemap`\n' +
      "  (the entry chunk's .map lists its sources); a feature's index or a heavy leaf in a shell.ts\n" +
      '  is the usual cause. If the growth is intended: npm run check:bundle -- --update'
  );
}
if (eager.length > 0) {
  failed = true;
  console.error('✗ Lazy chunks also imported statically (they would load with the page):');
  for (const line of eager.sort()) console.error(`  ${line}`);
  console.error(
    '  Look for `export { type X } from` (use `export type`) or a static import of the lazy module.'
  );
}
if (failed) process.exit(1);
console.log(
  `✓ Main chunk ${mainBytes} B (budget ${mainChunkBytes} + ${marginBytes} B); ${chunks.length} chunks, lazy ones stay lazy.`
);
