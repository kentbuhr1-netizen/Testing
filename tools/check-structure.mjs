#!/usr/bin/env node
/**
 * Check the things every game has to get right that no test can see.
 *
 * The game tests are thorough about the simulation — they replay seeds, walk
 * all 625 levels and prove each one is winnable. What none of them can notice
 * is the layer underneath: a module that never got added to the service
 * worker's asset list, an icon the manifest promises and nobody shipped, a
 * game that quietly started importing from `shared/` instead of its own copy.
 *
 * Those break the game *only offline*, and only after it has been installed —
 * which is to say, on a plane, for somebody who is not you, weeks later. This
 * script turns that class of bug into a red build.
 *
 *   node tools/check-structure.mjs [--quiet]
 *
 * Exits non-zero if anything is wrong, so CI can gate on it.
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const quiet = process.argv.includes('--quiet');

/* ── the rules ─────────────────────────────────────────────────────────── */

// Every game ships these. A game missing one is not a game yet.
const REQUIRED_FILES = [
  'index.html',
  'sw.js',
  'manifest.webmanifest',
  'package.json',
  'README.md',
  'icons/icon.svg',
];

/* ── reporting ─────────────────────────────────────────────────────────── */

const failures = [];
const warnings = [];
let checks = 0;

const ok = (msg) => {
  checks += 1;
  if (!quiet) console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
};
const bad = (scope, msg, detail) => {
  checks += 1;
  failures.push({ scope, msg, detail });
  console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
  for (const line of detail ?? []) console.log(`      ${line}`);
};
const warn = (scope, msg, detail) => {
  warnings.push({ scope, msg, detail });
  if (!quiet) {
    console.log(`  \x1b[33m!\x1b[0m ${msg}`);
    for (const line of detail ?? []) console.log(`      ${line}`);
  }
};

/* ── small helpers ─────────────────────────────────────────────────────── */

const read = (p) => readFileSync(p, 'utf8');
const isFile = (p) => existsSync(p) && statSync(p).isFile();

/** Game-relative, posix, `./`-prefixed — the form sw.js uses. */
const asAsset = (gameDir, absolute) => `./${relative(gameDir, absolute)}`;

/** Local, fetchable references only — skip absolute URLs, data: and anchors. */
const isLocalRef = (ref) =>
  ref &&
  !/^[a-z][a-z0-9+.-]*:/i.test(ref) &&
  !ref.startsWith('//') &&
  !ref.startsWith('#');

/** `href="…"` / `src="…"` out of an HTML file. */
const htmlRefs = (html) =>
  [...html.matchAll(/(?:href|src)\s*=\s*"([^"]+)"/g)]
    .map((m) => m[1].split(/[?#]/)[0])
    .filter(isLocalRef);

/**
 * Static specifiers out of an ES module. Covers every form the games use:
 * `import x from './a.js'`, a multi-line `import { … } from './b.js'`,
 * a bare `import './c.js'` for side effects, and `export … from './d.js'`.
 * The clause may span lines but never a quote or a semicolon, which is what
 * keeps this from running away into the next statement. Nothing is dynamic.
 */
const importsOf = (src) =>
  [...src.matchAll(/(?:^|[\n;])\s*(?:import|export)\b\s*(?:[^;'"]*?\bfrom\s*)?['"]([^'"]+)['"]/g)].map(
    (m) => m[1],
  );

/** The string literals inside `const ASSETS = [ … ];`. */
const swAssets = (src) => {
  const start = src.indexOf('const ASSETS');
  if (start === -1) return null;
  const open = src.indexOf('[', start);
  const close = src.indexOf('];', open);
  if (open === -1 || close === -1) return null;
  return [...src.slice(open, close).matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);
};

/** Walk the static import graph from an entry module. */
const moduleGraph = (entry) => {
  const seen = new Set();
  const missing = [];
  const queue = [entry];

  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file) || !isFile(file)) continue;
    seen.add(file);

    for (const spec of importsOf(read(file))) {
      if (!isLocalRef(spec)) continue;
      const target = resolve(dirname(file), spec);
      if (!isFile(target)) missing.push(`${relative(root, file)} → ${spec}`);
      else queue.push(target);
    }
  }
  return { files: seen, missing };
};

/* ── per-game checks ───────────────────────────────────────────────────── */

const gamesDir = join(root, 'games');
const games = readdirSync(gamesDir)
  .filter((name) => isFile(join(gamesDir, name, 'package.json')))
  .sort();

if (games.length === 0) {
  console.error('No games found under games/ — is this the right directory?');
  process.exit(1);
}

const ports = new Map();

for (const name of games) {
  const dir = join(gamesDir, name);
  console.log(`\n\x1b[1mgames/${name}\x1b[0m`);

  /* 1. the scaffolding is all there */
  const absent = REQUIRED_FILES.filter((f) => !isFile(join(dir, f)));
  if (absent.length) bad(name, 'has every file a game needs', absent.map((f) => `missing ${f}`));
  else ok('has every file a game needs');

  const testFiles = existsSync(join(dir, 'tests'))
    ? readdirSync(join(dir, 'tests')).filter((f) => f.endsWith('.test.mjs'))
    : [];
  if (testFiles.length) ok(`ships ${testFiles.length} test file(s)`);
  else bad(name, 'ships tests', ['no tests/*.test.mjs — the balance work is unguarded']);

  /* 2. package.json says what the house style says it should */
  let pkg = null;
  try {
    pkg = JSON.parse(read(join(dir, 'package.json')));
  } catch (e) {
    bad(name, 'package.json parses', [e.message]);
  }
  if (pkg) {
    const problems = [];
    if (pkg.type !== 'module') problems.push('"type" must be "module" — the games are ES modules');
    if (pkg.private !== true) problems.push('"private" must be true');
    for (const script of ['test', 'start', 'icons']) {
      if (!pkg.scripts?.[script]) problems.push(`missing scripts.${script}`);
    }
    if (problems.length) bad(name, 'package.json matches the house style', problems);
    else ok('package.json matches the house style');

    const port = pkg.scripts?.start?.match(/\b(\d{4,5})\b/)?.[1];
    if (port) {
      if (ports.has(port)) {
        bad(name, `serves on a port of its own`, [
          `port ${port} is already used by games/${ports.get(port)} — they cannot run side by side`,
        ]);
      } else {
        ports.set(port, name);
        ok(`serves on a port of its own (${port})`);
      }
    }
  }

  /* 3. every import resolves, and none of them leave the game */
  const entry = join(dir, 'js/app.js');
  let graph = { files: new Set(), missing: [] };
  if (!isFile(entry)) {
    bad(name, 'has js/app.js as its entry point', ['no js/app.js']);
  } else {
    graph = moduleGraph(entry);
    if (graph.missing.length) bad(name, 'every import resolves', graph.missing);
    else ok(`every import resolves (${graph.files.size} modules)`);

    const outside = [...graph.files].filter((f) => !resolve(f).startsWith(resolve(dir) + '/'));
    if (outside.length) {
      bad(name, 'imports nothing from outside its own directory', [
        ...outside.map((f) => relative(root, f)),
        'a service worker only caches its own scope — run tools/sync-payments.mjs instead',
      ]);
    } else {
      ok('imports nothing from outside its own directory');
    }
  }

  /* 4. the manifest promises nothing it does not ship */
  let manifest = null;
  const manifestPath = join(dir, 'manifest.webmanifest');
  if (isFile(manifestPath)) {
    try {
      manifest = JSON.parse(read(manifestPath));
    } catch (e) {
      bad(name, 'manifest.webmanifest parses', [e.message]);
    }
  }
  if (manifest) {
    const problems = [];
    for (const field of ['name', 'short_name', 'start_url', 'scope', 'icons']) {
      if (!manifest[field]) problems.push(`missing "${field}"`);
    }
    // Absolute scopes break the moment a game is hosted anywhere but the root.
    for (const field of ['start_url', 'scope']) {
      if (typeof manifest[field] === 'string' && manifest[field].startsWith('/')) {
        problems.push(`"${field}" is absolute ("${manifest[field]}") — it must be relative`);
      }
    }
    for (const icon of manifest.icons ?? []) {
      if (isLocalRef(icon.src) && !isFile(join(dir, icon.src))) {
        problems.push(`icons[].src "${icon.src}" does not exist`);
      }
    }
    if (problems.length) bad(name, 'the manifest ships everything it promises', problems);
    else ok('the manifest ships everything it promises');
  }

  /* 5. the service worker caches exactly what the game actually loads.
     This is the one that matters: anything missing here works perfectly in
     every browser until the moment it is offline. */
  const swPath = join(dir, 'sw.js');
  if (isFile(swPath)) {
    const assets = swAssets(read(swPath));
    if (!assets) {
      bad(name, 'sw.js declares an ASSETS list', ['could not find `const ASSETS = [ … ];`']);
    } else {
      const declared = new Set(assets);

      // Everything the game reaches for at runtime, in ASSETS form.
      const needed = new Set(['./', './index.html']);
      for (const file of graph.files) needed.add(asAsset(dir, file));
      for (const ref of htmlRefs(read(join(dir, 'index.html')))) {
        if (isFile(join(dir, ref))) needed.add(`./${ref}`);
      }
      for (const icon of manifest?.icons ?? []) {
        if (isLocalRef(icon.src) && isFile(join(dir, icon.src))) needed.add(`./${icon.src}`);
      }
      needed.add('./manifest.webmanifest');

      const uncached = [...needed].filter((a) => !declared.has(a)).sort();
      if (uncached.length) {
        bad(name, 'the service worker caches everything the game loads', [
          ...uncached.map((a) => `${a} is loaded but not in ASSETS — it will 404 offline`),
        ]);
      } else {
        ok(`the service worker caches everything the game loads (${declared.size} assets)`);
      }

      const phantom = assets
        .filter((a) => a !== './' && !existsSync(join(dir, a)))
        .sort();
      if (phantom.length) {
        bad(name, 'every cached asset exists', [
          ...phantom.map((a) => `${a} is in ASSETS but not on disk — install will fail outright`),
        ]);
      } else {
        ok('every cached asset exists');
      }

      // Not fatal, but a file nobody imports is either dead or forgotten.
      const reachable = new Set([...graph.files].map((f) => asAsset(dir, f)));
      const orphans = [];
      const walk = (d) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith('.js') && !reachable.has(asAsset(dir, p))) {
            orphans.push(asAsset(dir, p));
          }
        }
      };
      if (existsSync(join(dir, 'js'))) walk(join(dir, 'js'));
      if (orphans.length) {
        warn(name, 'every module under js/ is reachable from js/app.js', [
          ...orphans.sort().map((o) => `${o} is never imported — dead code, or a missing wire-up?`),
        ]);
      }
    }
  }

  /* 6. the game is actually findable from the front door */
  const indexHtml = read(join(root, 'index.html'));
  const readme = read(join(root, 'README.md'));
  const listed = [];
  if (!indexHtml.includes(`games/${name}/`)) listed.push('not linked from the root index.html');
  if (!readme.includes(`games/${name}`)) listed.push('not listed in the root README.md');
  if (listed.length) bad(name, 'is linked from the root index and README', listed);
  else ok('is linked from the root index and README');
}

/* ── summary ───────────────────────────────────────────────────────────── */

console.log('');
if (warnings.length && quiet) {
  console.log(`${warnings.length} warning(s) — re-run without --quiet to see them`);
}
if (failures.length) {
  console.error(
    `\x1b[31m${failures.length} of ${checks} checks failed\x1b[0m across ${games.length} games.`,
  );
  process.exit(1);
}
console.log(
  `\x1b[32mAll ${checks} checks passed\x1b[0m across ${games.length} games` +
    (warnings.length ? `, with ${warnings.length} warning(s).` : '.'),
);
