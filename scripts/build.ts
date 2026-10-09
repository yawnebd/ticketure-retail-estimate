/**
 * Builds the Apps Script project into dist/:
 *   dist/Code.js          server bundle + top-level stubs Apps Script can call
 *   dist/Index.html       form template with Tailwind CSS and the client bundle inlined
 *   dist/appsscript.json  manifest
 * Run with `npm run build`; `npm run push` builds and uploads with clasp.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const src = (...p: string[]) => join(root, 'src', ...p);

/** Server functions exposed to Apps Script (doGet) and to google.script.run. */
const GAS_EXPORTS = ['doGet', 'submitEstimate'] as const;
const GLOBAL = '__estimateServer';

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// --- Server: one IIFE, then plain function declarations Apps Script can discover.
const server = await build({
  entryPoints: [src('server', 'main.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: GLOBAL,
  target: 'es2019',
  platform: 'neutral',
  charset: 'utf8',
  legalComments: 'none',
});
const stubs = GAS_EXPORTS.map(
  (fn) => `function ${fn}() { return ${GLOBAL}.${fn}.apply(this, arguments); }`,
).join('\n');
writeFileSync(join(dist, 'Code.js'), `${server.outputFiles[0].text}\n${stubs}\n`);

// --- Client JS.
const client = await build({
  entryPoints: [src('client', 'main.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: true,
  charset: 'utf8',
  legalComments: 'none',
});
const js = client.outputFiles[0].text;

// --- Tailwind CSS (v4 CLI).
const tailwindCli = join(root, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
const cssOut = join(dist, '.styles.css');
execFileSync(process.execPath, [tailwindCli, '-i', src('client', 'styles.css'), '-o', cssOut, '--minify'], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});
const css = readFileSync(cssOut, 'utf8');
rmSync(cssOut);

// HtmlService treats <? ?> as template scriptlets, and </script> or </style> would end the inline block.
for (const [label, text, closer] of [['CSS', css, '</style'], ['JS', js, '</script']] as const) {
  if (text.includes('<?') || text.includes('?>') || text.toLowerCase().includes(closer)) {
    throw new Error(`${label} bundle contains a sequence that would break the HtmlService template.`);
  }
}

const template = readFileSync(src('client', 'index.html'), 'utf8');
const html = template
  .replace('<!-- @inline styles -->', () => `<style>${css}</style>`)
  .replace('<!-- @inline script -->', () => `<script>${js}</script>`);
if (html.includes('@inline')) throw new Error('An @inline marker in index.html was not replaced.');
writeFileSync(join(dist, 'Index.html'), html);

copyFileSync(join(root, 'appsscript.json'), join(dist, 'appsscript.json'));

const kb = (s: string) => `${(Buffer.byteLength(s) / 1024).toFixed(1)} kB`;
console.log(`dist/Code.js ${kb(readFileSync(join(dist, 'Code.js'), 'utf8'))}, dist/Index.html ${kb(html)} (css ${kb(css)}, js ${kb(js)})`);
