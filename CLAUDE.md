# Working in this repo

A series of phone-first browser games. Each game under `games/` is a complete,
independent project — its own `package.json`, tests, icons, service worker and
PWA scope. Nothing in one game imports anything from another, so any of them
can be lifted out and hosted on its own.

## Commands

```bash
npm run check            # the gate — structure + all 284 tests. Run before pushing.
npm run check:structure  # just the structural invariants (instant)
npm run test:all         # just the tests
npm run sync             # re-copy shared client code into each game
npm start                # serve on http://localhost:8080
```

`npm run check` is exactly what CI runs (`.github/workflows/check.yml`). There
is no build step, no framework and no dependency install — `npm run check`
works on a fresh clone.

Inside a game directory: `npm test`, `npm run icons`.

## The constraints that make these games work

These are deliberate. Do not relax one to make something easier.

- **No build step, no framework, no network calls.** ES modules served as-is.
- **The simulation is pure and DOM-free.** `js/sim.js`, `js/campaign.js` and
  `js/ops.js` must stay importable from node with no browser globals — that is
  what lets the tests play and balance the whole game headlessly.
- **Seeded determinism.** The same seed always replays the same run. Anything
  that reaches for `Math.random()` or `Date.now()` inside the sim breaks the
  promise that a lost level is a puzzle rather than a dice roll.
- **Targets are measured, not guessed.** Reference players play each exact
  level and the target is a share of what the best of them managed. Every game
  has a test walking all 625 levels asserting none asks for more than it can
  give. If a balance change turns that red, the change is wrong — not the test.
- **One thing can never be stockpiled** in each game (ice, beds, daylight).
  That is what stops the operations layer replacing the game.

## Invariants `check:structure` enforces

`tools/check-structure.mjs` catches the class of bug no test can see — the
things that work perfectly in a browser and fail only once the game is
installed and offline:

| | |
|---|---|
| Service worker | every module, icon and stylesheet the game loads is in `sw.js` `ASSETS`, and every `ASSETS` entry exists on disk |
| Isolation | a game imports nothing from outside its own directory |
| Manifest | parses, `start_url`/`scope` are relative, every icon it promises exists |
| Scaffolding | `index.html`, `sw.js`, `manifest.webmanifest`, `package.json`, `README.md`, `icons/icon.svg`, `tests/*.test.mjs` |
| package.json | `type: module`, `private: true`, `test`/`start`/`icons` scripts, a port no other game uses |
| Discoverability | the game is linked from the root `index.html` and `README.md` |

It also warns about modules under `js/` that nothing imports — usually either
dead code or a wire-up somebody forgot.

## Two things that bite

**Editing a synced file.** `shared/payments/client/*`, `shared/payments/catalog.js`
and `shared/bonusshop/client/*` are **copied into each game** by
`tools/sync-payments.mjs`. A service worker only caches its own scope, so a
game importing `../../shared/...` would work on a desktop and fail on a plane.
Edit the file under `shared/`, then run `npm run sync`. The copies carry a
banner saying so, and `npm run test:all` fails if they drift.

**Adding a file to a game.** It must also go into the `ASSETS` list in that
game's `sw.js`, *and* the `CACHE` constant at the top must be bumped
(`outbreak-v2` → `outbreak-v3`). Without the bump, everyone with the game
installed keeps serving the old cache and never sees the new file.
`check:structure` catches the first; only you can catch the second.

## Adding a new game

Copy the shape of an existing game — `games/outbreak` is the smallest complete
one. Then: give it its own port, add it to the root `index.html` and the
`README.md` table, run `npm run sync` to bring in the shared client, and run
`npm run check`. Push it on a `claude/game-*` branch and
`.github/workflows/open-game-pr.yml` opens the pull request for it.

## Style

Match the surrounding code: no semicolon-free experiments, no new dependencies,
comments that explain *why* rather than restating the line. Test names in this
repo read as sentences about behaviour ("a yard that runs dry still owes every
wage"), not as `test_foo_returns_bar`. Keep it that way.
