#!/usr/bin/env node
/**
 * Play every game through its core loop in a real browser and report anything
 * that breaks on the way.
 *
 *   node tools/regression.mjs            # every game
 *   node tools/regression.mjs lemonade   # just one
 *
 * `npm run check` proves the simulation is right and the scaffolding is
 * complete; neither can see the wiring between them. The bugs this catches are
 * the ones where a screen renders but a button is dead, a value arrives as
 * `NaN`, or an action name in the markup does not match the handler — all of
 * which pass every unit test. Every finding here is a real one: a console
 * error, an exception, a screen that never changed, or `NaN`/`undefined`
 * rendered where a number belongs.
 *
 * Uses the Playwright Chromium that ships with this container, the same way
 * tools/make-store-assets.mjs does. It is deliberately not part of
 * `npm run check`, which must keep working on a fresh clone with no browser.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

/** Serve the repo on an ephemeral port. ES modules need a real origin. */
async function serve() {
  const server = createServer(async (req, res) => {
    const path = join(root, decodeURIComponent(req.url.split('?')[0]));
    try {
      const body = await readFile(path);
      res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

/* ------------------------------------------------------------------ *
 * The flows
 *
 * One per game, because the games do not share a vocabulary: Lemonade
 * Stand buys stock and opens a stand, Outbreak sets levers and runs a
 * week, The Round plans a route and works a day, The Ledger reads
 * applications and rules on them. What they share is the shape — a
 * briefing, a decision, a report — so each flow walks that shape once.
 * ------------------------------------------------------------------ */

const FLOWS = {
  async lemonade(g) {
    await g.click('[data-act="tutorial-skip"]', { optional: true });
    await g.openAndClose('[data-act="open-achievements"]', '[data-act="close-achievements"]', 'achievements');
    await g.openAndClose('[data-act="open-bonus-shop"]', '[data-act="close-bonus-shop"]', 'bonus shop');

    await g.click('[data-act="free-play"]');
    await g.expectText('Pick a starting stake', 'free-play difficulty picker');
    await g.click('[data-act="start-free-play"][data-difficulty="medium"]');

    await g.click('[data-act="to-buy"]');
    await g.click('[data-act="preset"][data-cups="50"]');
    await g.click('[data-act="confirm-buy"]');
    await g.expectText('Open for Business', 'the stand, stocked');
    await g.click('[data-act="open-stand"]');
    await g.click('#screen'); // the day animation is skippable; do not wait it out
    await g.expectText('CUPS SOLD', "the day's report", { caseInsensitive: true });
    await g.click('[data-act="next-day"]');
    await g.click('[data-act="quit-run"]');
  },

  async outbreak(g) {
    await g.openAndClose('[data-act="openHelp"]', '[data-act="backFromHelp"]', 'how to play');
    await g.openAndClose('[data-act="open-bonus-shop"]', '[data-act="close-bonus-shop"]', 'bonus shop');
    await g.click('[data-act="freePlay"]');
    await g.click('[data-act="toMeasures"]');
    await g.click('[data-act="runWeek"]');
    await g.expectText('report', 'the week report', { caseInsensitive: true });
    await g.click('[data-act="closeReport"]');
    await g.expectText('Week 2', 'the second week, after closing the report');
  },

  async 'the-round'(g) {
    await g.openAndClose('[data-act="openHelp"]', '[data-act="backFromHelp"]', 'how to play');
    await g.openAndClose('[data-act="open-bonus-shop"]', '[data-act="close-bonus-shop"]', 'bonus shop');
    await g.click('[data-act="freePlay"]');
    await g.click('[data-act="declineOffer"]', { optional: true }); // an offer only shows some mornings
    await g.click('[data-act="toRoute"]');
    await g.click('[data-act="workDay"]');
    await g.expectText('done', "the day's report", { caseInsensitive: true });
    await g.click('[data-act="closeReport"]');
    await g.expectText('Day 2', 'the second day, after closing the report');
  },

  async 'the-ledger'(g) {
    await g.openAndClose('[data-act="openHelp"]', '[data-act="backFromHelp"]', 'how to play');
    await g.openAndClose('[data-act="open-bonus-shop"]', '[data-act="close-bonus-shop"]', 'bonus shop');
    await g.click('[data-act="freePlay"]');
    await g.click('[data-act="openDesk"]');
    // Rule on whatever is on the desk until the week closes out.
    for (let i = 0; i < 40; i++) {
      const ruled = await g.click(i % 2 ? '[data-act="decline"]' : '[data-act="approve"]', { optional: true });
      if (!ruled) break;
    }
    await g.expectText('closed', 'the week closed', { caseInsensitive: true });
    await g.click('[data-act="closeReport"]');
    await g.expectText('Week 2', 'the second week, after closing the report');
  },
};

/** The campaign side, which every game reaches the same way. */
async function campaignFlow(g) {
  const kebab = g.slug === 'lemonade';
  await g.click(kebab ? '[data-act="new-campaign"]' : '[data-act="newCampaign"]');
  const place = await g.firstDataAct(['open-city', 'openRegion', 'openTown', 'openBranch']);
  if (!place) return g.finding('no place to open on the campaign map');
  await g.click(place);
  const level = await g.firstDataAct(['open-corner', 'openDistrict', 'openRound', 'openBook']);
  if (!level) return g.finding('no first level to open — the campaign map opened nothing');
  await g.click(level);
  await g.expectText('Easy', 'the first level briefing');
  await g.click(kebab ? '[data-act="start-run"]' : '[data-act="startRun"]');
}

/* ------------------------------------------------------------------ *
 * The driver
 * ------------------------------------------------------------------ */

/** Everything a flow is handed: clicks that assert, and text that must appear. */
function driver(page, slug, findings) {
  const finding = (what) => { findings.push(`${slug}: ${what}`); return false; };
  const body = () => page.textContent('body');

  const g = {
    slug,
    finding,

    /** Click and settle. Returns false when `optional` and nothing matched. */
    async click(selector, { optional = false } = {}) {
      const el = await page.$(selector);
      if (!el) return optional ? false : finding(`nothing to click for ${selector}`);
      if (await el.isDisabled().catch(() => false)) {
        return optional ? false : finding(`${selector} was disabled`);
      }
      const before = await body();
      await el.click();
      await page.waitForTimeout(160);
      if (await body() === before) finding(`clicking ${selector} changed nothing on screen`);
      return true;
    },

    async expectText(needle, label, { caseInsensitive = false } = {}) {
      const text = await body();
      const found = caseInsensitive
        ? text.toLowerCase().includes(needle.toLowerCase())
        : text.includes(needle);
      if (!found) finding(`${label}: expected to see "${needle}"`);
    },

    /** Open a screen, prove it rendered something, and come back. */
    async openAndClose(openSelector, closeSelector, label) {
      if (!await g.click(openSelector, { optional: true })) return;
      const text = await body();
      if (text.trim().length < 40) finding(`${label} opened almost empty`);
      await g.click(closeSelector);
    },

    /** The first of these action names actually present, as a selector. */
    async firstDataAct(names) {
      for (const name of names) {
        if (await page.$(`[data-act="${name}"]`)) return `[data-act="${name}"]`;
      }
      return null;
    },

    /** Nothing on screen should ever read NaN, undefined, or nothing at all. */
    async assertReadable(label) {
      const text = await body();
      if (/\bNaN\b/.test(text)) finding(`"NaN" on screen at ${label}`);
      if (/\bundefined\b/.test(text)) finding(`"undefined" on screen at ${label}`);
      if (text.trim().length === 0) finding(`blank screen at ${label}`);
    },
  };
  return g;
}

async function playGame(browser, origin, slug) {
  const findings = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  // A service worker would serve its own cache instead of the files under
  // test, and the point here is to test the files under test.
  await context.addInitScript(() => {
    if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.resolve();
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') findings.push(`${slug}: console ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => findings.push(`${slug}: uncaught ${e.message}`));

  const g = driver(page, slug, findings);
  try {
    await page.goto(`${origin}/games/${slug}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await g.assertReadable('the title screen');

    await FLOWS[slug](g);
    await g.assertReadable('the end of the free-play flow');

    await page.goto(`${origin}/games/${slug}/index.html`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    await g.click('[data-act="tutorial-skip"]', { optional: true });
    await campaignFlow(g);
    await g.assertReadable('the first campaign level');
  } catch (err) {
    findings.push(`${slug}: the flow threw — ${err.message}`);
  } finally {
    await context.close();
  }
  return findings;
}

/* ------------------------------------------------------------------ */

const slugs = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const games = (slugs.length ? slugs : readdirSync(join(root, 'games')))
  .filter((slug) => existsSync(join(root, 'games', slug, 'index.html')));

// A mistyped slug must not read as a clean run.
if (!games.length) {
  console.error(slugs.length ? `No such game: ${slugs.join(', ')}` : 'No games found under games/.');
  process.exit(1);
}

const missing = games.filter((slug) => !FLOWS[slug]);
if (missing.length) {
  console.error(`No flow written for: ${missing.join(', ')}. Add one to FLOWS in this file.`);
  process.exit(1);
}

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/node22/lib/node_modules/playwright/index.mjs');
const site = await serve();
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

let total = 0;
for (const slug of games) {
  const findings = await playGame(browser, site.origin, slug);
  total += findings.length;
  console.log(`${findings.length ? '✗' : '✓'} ${slug}${findings.length ? ` — ${findings.length} finding(s)` : ''}`);
  findings.forEach((f) => console.log(`    ${f}`));
}

await browser.close();
site.close();

console.log(total ? `\n${total} finding(s) across ${games.length} game(s).` : `\nAll ${games.length} games played clean.`);
process.exit(total ? 1 : 0);
