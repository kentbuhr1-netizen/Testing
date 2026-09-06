#!/usr/bin/env node
/**
 * Give a game a store app: a Capacitor shell in games/<slug>/app/ that wraps
 * the game exactly as it ships on the web, one app per game.
 *
 *   node tools/make-app.mjs <slug> [--id com.yourcompany.<slug>]
 *   node tools/make-app.mjs --all
 *
 * Idempotent: re-running refreshes the generated files and leaves anything
 * you edited by hand (the README's store copy, say) alone if it has changed.
 *
 * The shell adds exactly two things the web build does not have:
 *   - native-storage.js: mirrors localStorage into Capacitor Preferences, so a
 *     save survives the WebView storage eviction iOS is entitled to do
 *   - a build step that copies the game's static files into app/www
 * The game's own code is not touched. Every game stays liftable alone.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const args = process.argv.slice(2);
const all = args.includes('--all');
const idFlag = args.indexOf('--id');
const explicitId = idFlag >= 0 ? args[idFlag + 1] : null;
const slugs = all
  ? readdirSync(join(root, 'games')).filter((d) => existsSync(join(root, 'games', d, 'manifest.webmanifest')))
  : args.filter((a) => !a.startsWith('--') && a !== explicitId);
if (slugs.length === 0) { console.error('usage: node tools/make-app.mjs <slug> | --all'); process.exit(1); }

const CAP = '^8.0.0';

/** Write a file unless it exists and someone has edited it away from what we last generated. */
function emit(path, content, { keepEdits = false } = {}) {
  if (existsSync(path) && keepEdits) {
    const stamp = join(path + '.generated');
    const last = existsSync(stamp) ? readFileSync(stamp, 'utf8') : null;
    const current = readFileSync(path, 'utf8');
    if (last !== null && current !== last) { console.log(`kept   ${rel(path)} (edited by hand)`); return; }
  }
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
  if (keepEdits) writeFileSync(path + '.generated', content);
  console.log(`wrote  ${rel(path)}`);
}
const rel = (p) => p.replace(root + '/', '');

for (const slug of slugs) {
  const game = join(root, 'games', slug);
  const app = join(game, 'app');
  const manifest = JSON.parse(readFileSync(join(game, 'manifest.webmanifest'), 'utf8'));
  const appId = explicitId && slugs.length === 1 ? explicitId : `com.kentbuhr.${slug.replace(/-/g, '')}`;
  const name = manifest.name;

  emit(join(app, 'package.json'), JSON.stringify({
    name: `${slug}-app`,
    private: true,
    version: '1.0.0',
    description: `${name} — the store app. Wraps the web game in games/${slug} unchanged.`,
    type: 'module',
    scripts: {
      build: 'node build.mjs',
      sync: 'npm run build && npx cap sync',
      'add:android': 'npx cap add android',
      'add:ios': 'npx cap add ios',
      'open:android': 'npx cap open android',
      'open:ios': 'npx cap open ios',
    },
    dependencies: {
      '@capacitor/android': CAP,
      '@capacitor/core': CAP,
      '@capacitor/ios': CAP,
      '@capacitor/preferences': CAP,
    },
    devDependencies: { '@capacitor/cli': CAP },
  }, null, 2) + '\n');

  emit(join(app, 'capacitor.config.json'), JSON.stringify({
    appId,
    appName: name,
    webDir: 'www',
    backgroundColor: manifest.background_color,
    android: { allowMixedContent: false, backgroundColor: manifest.background_color },
    ios: { contentInset: 'automatic', backgroundColor: manifest.background_color, scheme: name.replace(/\s+/g, '') },
    server: { androidScheme: 'https' },
  }, null, 2) + '\n');

  emit(join(app, '.gitignore'), ['node_modules/', 'www/', 'android/', 'ios/', '*.generated', ''].join('\n'));

  emit(join(app, 'build.mjs'), `#!/usr/bin/env node
/**
 * Copy the game into www/ for Capacitor, exactly as it ships on the web, plus
 * the native-storage shim loaded ahead of the game so saves outlive the
 * WebView's storage. Run by \`npm run build\`; \`npm run sync\` runs it and
 * then \`cap sync\`.
 */
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const app = new URL('.', import.meta.url).pathname.replace(/\\/$/, '');
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
html = html.replace(/<script type="module" src="js\\/app.js"><\\/script>/,
  '<script src="native-storage.js"></script>\\n  <script type="module" src="js/app.js"></script>');
writeFileSync(join(www, 'index.html'), html);
cpSync(join(app, 'native-storage.js'), join(www, 'native-storage.js'));
console.log('www/ built from ../ — ' + (html.includes('native-storage.js') ? 'native storage shim in place' : 'WARNING: shim not injected; check the app.js script tag'));
`);

  emit(join(app, 'native-storage.js'), `/**
 * Keep the save when the WebView loses its storage.
 *
 * The game writes everything — the campaign, the best score, achievements,
 * bonus-shop cooldowns, the licence — to localStorage, which is exactly what
 * a browser should get. Inside an app, iOS is entitled to evict WebView
 * storage under pressure, and a player would open the app to an empty title
 * screen. So when Capacitor's Preferences plugin is present, every write is
 * mirrored into native storage and every launch restores from it first.
 *
 * Loaded as a classic script before the game's module, so the restore has
 * finished before store.js runs. Does nothing at all in a plain browser.
 */
(function () {
  var prefs = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
  if (!prefs) return;
  // This game's own keys, plus the licence the payments client keeps under a
  // game-neutral name — the app is one game, so it can only be this game's.
  var PREFIXES = [${JSON.stringify(slug + '-')}, 'game-licence'];
  function ours(key) {
    if (typeof key !== 'string') return false;
    for (var i = 0; i < PREFIXES.length; i++) if (key.indexOf(PREFIXES[i]) === 0) return true;
    return false;
  }

  function mirror(key, value) {
    if (!ours(key)) return;
    (value === null ? prefs.remove({ key: key }) : prefs.set({ key: key, value: String(value) })).catch(function () {});
  }

  var setItem = localStorage.setItem.bind(localStorage);
  var removeItem = localStorage.removeItem.bind(localStorage);
  localStorage.setItem = function (k, v) { setItem(k, v); mirror(k, v); };
  localStorage.removeItem = function (k) { removeItem(k); mirror(k, null); };

  // Restore anything the WebView has lost. Synchronous-looking to the game:
  // the module script that follows does not run until this classic script
  // has returned, and the restore is kicked off here and awaited by the
  // entry below only when there is something to restore.
  window.__nativeStorageReady = prefs.keys().then(function (r) {
    var keys = (r && r.keys) || [];
    return Promise.all(keys.filter(ours).map(function (k) {
      return prefs.get({ key: k }).then(function (v) {
        if (v && v.value != null && localStorage.getItem(k) == null) setItem(k, v.value);
      });
    }));
  }).catch(function () {});
})();
`);

  emit(join(app, 'README.md'), `# ${name} — the store app

One app, one game. This folder wraps the web game in \`games/${slug}\` unchanged
in a [Capacitor](https://capacitorjs.com) shell, for the App Store and Google
Play. Nothing in the game changes; every file the browser gets, the app gets.

\`\`\`bash
cd games/${slug}/app
npm install
npm run add:android      # once, on any machine
npm run add:ios          # once, on a Mac with Xcode
npm run sync             # every time the game changes: rebuild www/, then cap sync
npm run open:ios         # then archive and upload from Xcode
npm run open:android     # then build a signed bundle from Android Studio
\`\`\`

## What the shell adds

- **Native save mirroring** (\`native-storage.js\`). iOS may evict WebView storage;
  every localStorage write is mirrored into Capacitor Preferences and restored on
  launch. A player never loses a campaign to the OS.
- **A build step** (\`build.mjs\`) that copies the game into \`www/\` and loads the
  shim ahead of the game. Nothing else is altered.

## Before you submit — the parts no script can do

- **App id:** \`${appId}\`. Change it in \`capacitor.config.json\` before the first
  \`cap add\`; it cannot change after a store listing exists.
- **Payments.** The web paywall sells unlocks through Stripe. Both stores require
  their own in-app purchase for digital goods. Ship with \`js/payments.config.js\`
  blank (the complete game, no paywall — the default) or swap the licence check
  for StoreKit / Play Billing behind \`js/payments/client/entitlements.js\`.
- **The bonus shop** plays a timed stand-in for a rewarded ad and says so on
  screen. Stores reject placeholder functionality: wire a real rewarded ad behind
  \`js/bonusshop/shell.js\` (the hook is designed for AdMob) or hide the shop in
  store builds.
- **Store assets** are in \`assets/\` once \`node tools/make-store-assets.mjs ${slug}\`
  has run from the repo root: a 1024×1024 icon and a splash. Screenshots still
  have to come from real devices.
- **Privacy policy and store listing** drafts are in \`store/\`. The policy needs a
  public URL; the listing needs a human read.
`, { keepEdits: true });

  emit(join(app, 'store', 'privacy-policy.md'), `# ${name} — Privacy Policy

_Last updated: ${new Date().toISOString().slice(0, 10)}_

**${name} does not collect personal data.**

- The game runs entirely on your device. It makes no network requests of its
  own and contains no analytics, tracking, or crash reporting.
- Your progress — campaigns, scores and achievements — is stored only on your
  device. It is never uploaded anywhere. Deleting the app deletes it.
- The game does not ask for your name, email, location, contacts, photos, or
  any other personal information, and has no accounts.

**If a future version adds purchases or advertising**, this policy will be
updated first. Purchases would be handled by Apple or Google and governed by
their policies; we would receive no card details. Rewarded advertising, if
added, would be served by the ad network named here at that time, under its
policy, and would be optional — nothing in the game requires watching an ad.

**Children.** The game is suitable for general audiences and collects no data
from anyone, of any age.

**Contact.** Questions about this policy: _[your email here]_.
`, { keepEdits: true });

  emit(join(app, 'store', 'listing.md'), `# ${name} — store listing

**Name:** ${name}
**Subtitle (30 chars):** _[fill in]_
**Category:** Games › Strategy / Simulation
**Age rating:** fill in from the questionnaire — no violence, no user content, no data collection.

## Short description (80 chars)
${manifest.description}

## Full description
${manifest.description}

_[Expand from the game's README: the core decision each turn, the campaign
(25 places × 25 levels, four difficulty tiers), that targets are measured
against reference play rather than guessed, and that the same seed always
replays the same run so a level you lost is a puzzle you can learn.]_

## Keywords
${slug.replace(/-/g, ' ')}, strategy, simulation, offline, campaign, tycoon

## What's new (first release)
First release.

## Screenshots needed
- iPhone 6.7" (1290×2796) × 3–5
- iPhone 6.5" (1284×2778) × 3–5
- iPad 12.9" (2048×2732) × 3 if supporting iPad
- Android phone × 3–8, plus a 1024×500 feature graphic
`, { keepEdits: true });
}
console.log(`\n${slugs.length} app shell(s) ready. Next: cd games/<slug>/app && npm install && npm run sync`);
