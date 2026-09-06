#!/usr/bin/env node
/**
 * Render the store artwork a game's app needs from its own icons/icon.svg:
 *
 *   app/assets/icon-1024.png    App Store icon (no alpha, square)
 *   app/assets/splash-2732.png  launch screen: the icon centred on the game's
 *                               background colour, sized for every device
 *
 *   node tools/make-store-assets.mjs <slug> | --all
 *
 * Uses the Playwright Chromium that ships with this container.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const args = process.argv.slice(2);
const slugs = args.includes('--all')
  ? readdirSync(join(root, 'games')).filter((d) => existsSync(join(root, 'games', d, 'icons', 'icon.svg')))
  : args;
if (!slugs.length) { console.error('usage: node tools/make-store-assets.mjs <slug> | --all'); process.exit(1); }

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

for (const slug of slugs) {
  const game = join(root, 'games', slug);
  const out = join(game, 'app', 'assets');
  mkdirSync(out, { recursive: true });
  const svg = readFileSync(join(game, 'icons', 'icon.svg'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(game, 'manifest.webmanifest'), 'utf8'));
  const bg = manifest.background_color || '#ffffff';
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

  const shots = [
    { file: 'icon-1024.png', w: 1024, h: 1024, html: `<img src="${dataUri}" style="width:1024px;height:1024px;display:block">`, bg },
    { file: 'splash-2732.png', w: 2732, h: 2732, html: `<img src="${dataUri}" style="width:900px;height:900px;position:absolute;left:916px;top:916px">`, bg },
  ];
  for (const s of shots) {
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><body style="margin:0;background:${s.bg};width:${s.w}px;height:${s.h}px;overflow:hidden">${s.html}</body>`);
    await page.waitForTimeout(150);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: s.w, height: s.h }, omitBackground: false });
    writeFileSync(join(out, s.file), png);
    await page.close();
    console.log(`wrote  games/${slug}/app/assets/${s.file} (${s.w}×${s.h}, ${(png.length / 1024).toFixed(0)} KB)`);
  }
}
await browser.close();
