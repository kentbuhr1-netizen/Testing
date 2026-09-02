# Games

A series of phone-first browser games. One new game a week, each a
self-contained project sharing the same spine.

| | | |
|---|---|---|
| 🍋 | [`games/lemonade`](games/lemonade) | **Lemonade Stand** — read the weather, mix the pitcher, set your price |
| 🦠 | [`games/outbreak`](games/outbreak) | **Outbreak** — contain an epidemic with four levers that fight each other |
| 🌱 | [`games/the-round`](games/the-round) | **The Round** — plan a grass-cutting round against the daylight |

Each game is completely independent: its own `package.json`, tests, icons,
service worker and PWA scope. Nothing in one game imports anything from
another, so any of them can be lifted out and hosted on its own.

## Playing them

```bash
npm start        # serves everything on http://localhost:8080
```

Then open `/games/lemonade/`, `/games/outbreak/` or `/games/the-round/` — or
just `/` for the index. On a phone, **Add to Home Screen** installs the one you
are looking at; each has its own icon and runs offline.

## The house style

Every game in the series is built the same way, because the constraints are
what make them good:

- **No build step, no framework, no network calls.** ES modules served as-is.
- **The simulation is pure and DOM-free**, so the whole game can be played and
  balanced from node. That is how the balancing below gets done.
- **Seeded determinism.** The same seed always replays the same run, so a level
  you lost is a puzzle you can learn rather than a dice roll.
- **25 places × 25 levels**, four difficulty tiers, opening two at a time.
- **Targets are measured, not guessed.** A family of reference players plays
  each exact level and the target is a share of what the best of them managed —
  40% on Easy up to 93% on Impossible. Every game has a test that walks all 625
  and asserts no level asks for more than it can give.
- **Something meaningful is hidden** and inferred from qualitative feedback
  rather than read off a number: the recipe, the pathogen, the client.
- **An operations layer** unlocks partway through and ticks in step with the
  turns you play by hand — and in each game there is one thing that cannot be
  stockpiled, which is what stops the empire replacing the game.

## Shared

| | |
|---|---|
| [`shared/payments`](shared/payments) | The shop: Stripe checkout, signed licences, one server for every game |
| `tools/sync-payments.mjs` | Copies the payments client into each game — a service worker only caches its own scope, so each game owns a copy |
| `tools/check-structure.mjs` | Checks what no test can see: that every game caches everything it loads, ships everything its manifest promises, and imports nothing from outside itself |
| `.github/workflows/check.yml` | Runs `npm run check` on every push and pull request |
| `.github/workflows/open-game-pr.yml` | Opens a pull request automatically for each `claude/game-*` branch |

Payments are **off** unless configured: with a game's `js/payments.config.js`
left blank, that game is the complete game. See
[`shared/payments/README.md`](shared/payments/README.md) to switch the shop on.

## Working on them

```bash
npm run check        # the gate: structural checks, then every test. What CI runs.
npm run test:all     # every game's tests, plus the payments tests
npm run sync         # re-copy the shared payments client into each game
```

`npm run check` needs nothing installed — the games have no dependencies, so it
runs on a fresh clone. [`CLAUDE.md`](CLAUDE.md) has the house rules in full,
including the two that bite: never edit a synced copy, and always bump a
service worker's `CACHE` when you change its `ASSETS`.

Inside any game directory:

```bash
npm test             # just that game
npm run icons        # rebuild its PNG icons from its SVG
```
