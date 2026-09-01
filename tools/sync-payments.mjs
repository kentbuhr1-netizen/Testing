#!/usr/bin/env node
/**
 * Copy the shared payments client into each game.
 *
 * The games are offline-first PWAs, and a service worker can only intercept
 * requests inside its own scope — so a game importing `../../shared/...`
 * would load fine on a desktop and fail on a plane. Each game therefore owns
 * a copy, and this script is what keeps the copies honest.
 *
 *   node tools/sync-payments.mjs [--check]
 *
 * `--check` verifies the copies are current without writing, for CI.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const check = process.argv.includes('--check');

const SOURCES = [
  ['shared/payments/catalog.js', 'js/payments/catalog.js'],
  ['shared/payments/client/licence.js', 'js/payments/client/licence.js'],
  ['shared/payments/client/entitlements.js', 'js/payments/client/entitlements.js'],
  ['shared/payments/client/paywall.js', 'js/payments/client/paywall.js'],
];

const GAMES = [
  { name: 'lemonade', dir: '.' },
  { name: 'outbreak', dir: 'games/outbreak' },
];

const banner = (from) =>
  `/* Copied from ${from} by tools/sync-payments.mjs — edit the shared copy, not this one. */\n`;

let stale = 0;
let written = 0;

for (const game of GAMES) {
  for (const [from, to] of SOURCES) {
    const source = banner(from) + readFileSync(join(root, from), 'utf8');
    const target = join(root, game.dir, to);
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null;

    if (current === source) continue;
    if (check) {
      console.error(`stale: ${join(game.dir, to)}`);
      stale += 1;
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
    console.log(`wrote ${join(game.dir, to)}`);
    written += 1;
  }
}

if (check && stale > 0) {
  console.error(`\n${stale} file(s) out of date. Run: node tools/sync-payments.mjs`);
  process.exit(1);
}
if (check) console.log('payments client is in sync');
else console.log(written ? `synced ${written} file(s)` : 'already in sync');
