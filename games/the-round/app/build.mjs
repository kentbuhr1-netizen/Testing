#!/usr/bin/env node
/**
 * Copy the game into www/ for Capacitor, exactly as it ships on the web, plus
 * the native-storage shim loaded ahead of the game so saves outlive the
 * WebView's storage. Run by `npm run build`; `npm run sync` runs it and
 * then `cap sync`.
 */
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const app = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
const game = join(app, '..');
const www = join(app, 'www');

rmSync(www, { recursive: true, force: true });
mkdirSync(www, { recursive: true });
for (const entry of ['index.html', 'css', 'js', 'icons', 'manifest.webmanifest', 'sw.js']) {
  const from = join(game, entry);
  if (existsSync(from)) cpSync(from, join(www, entry), { recursive: true });
}
// sw.js ships too. The game registers it unconditionally; leaving it out is a
// 404 on every launch. On Android it caches files that are already local —
// harmless — and iOS refuses workers on the app scheme, which the game's own
// .catch() swallows. Either way: no error, no behaviour change.
let html = readFileSync(join(www, 'index.html'), 'utf8');
html = html.replace(/<script type="module" src="js\/app.js"><\/script>/,
  '<script src="native-storage.js"></script>\n  <script type="module" src="js/app.js"></script>');
writeFileSync(join(www, 'index.html'), html);
cpSync(join(app, 'native-storage.js'), join(www, 'native-storage.js'));
console.log('www/ built from ../ — ' + (html.includes('native-storage.js') ? 'native storage shim in place' : 'WARNING: shim not injected; check the app.js script tag'));
