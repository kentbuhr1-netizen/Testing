# 🍋 Lemonade Stand

The classic lemonade stand game, grown into a campaign: **25 cities across the
US and Europe, 25 street corners each**. Start on one corner with a few dollars,
clear its profit target, and the next corner opens. Take all 25 and the city is
yours. Take five cities and you can stop pouring by hand — build depots, buy
wholesale and staff the corners you already own.

Built to play on a phone: one static page, no build step, no framework, no
network calls. Add it to your home screen and it runs offline.

## Play it on your phone

```bash
npm start          # serves this folder on http://localhost:8080
```

Open `http://<your-computer's-LAN-ip>:8080` on your phone, then **Add to Home
Screen** to install it.

> The game is loaded as ES modules, so it must be served over http(s).
> Opening `index.html` straight off the filesystem will not work.

## The day loop

Every corner is played a day at a time:

1. **Forecast** — the weather and any local news set how many people walk past.
2. **Supplies** — lemons, sugar, ice and cups at prices that drift daily.
   Unpoured ice **melts overnight**; everything else keeps.
3. **The stand** — set the recipe (per 10-cup pitcher) and the price per cup.
4. **Open up** — each passer-by decides whether your lemonade is worth the ask.

Heat sells, taste is a hidden target you learn from customer grumbles, and every
cent of price costs you customers. Reputation compounds, and the last stretch to
a perfect one is the hardest to earn.

## The campaign

**Four tiers.** Each city's 25 corners run 🟢 Easy ×7, 🟡 Medium ×7, 🟠 Hard ×7,
🔴 Impossible ×4 — shorter money, tighter days and fussier customers as you climb.

**Targets are measured, not guessed.** Before a corner is offered, a near-optimal
reference player (`parProfit` in `js/sim.js`) plays that exact corner — its
weather, its prices, its quirks — and the target is a share of what it cleared:
40% on Easy up to 93% on Impossible. A drizzly corner in Seattle therefore asks
for less than a tourist corner in Rome, and no corner can ask for more than the
game can actually produce. A test asserts that for all 625.

**The weather never changes.** Retry a corner and the same days come back, so a
corner you lost is a puzzle you can learn rather than a dice roll.

**Every city bends one rule.** Phoenix melts the ice in the cup. Paris will pay
well for something excellent and nothing for less. Amsterdam is all traffic and
no patience. Reykjavík is nearly empty and pays almost anything. Berlin is cheap
in both directions. The corner briefing spells out exactly what you are walking
into before you stake anything.

Cities open two at a time, so there is always somewhere else to go.

## Operations (after 5 cities)

Claimed corners can be put to work:

- **Depots** — one per city, holding lemons, sugar and cups.
  *Ice is never stocked, because ice melts*; staffed corners buy theirs locally.
- **Wholesale** — buy by the crate, with discounts at 400 / 1,000 / 2,000 units.
- **Staff** — hire onto any corner you own. Wages and depot upkeep are owed every
  day, sold out or not, and a depot that runs dry leaves your corners standing
  idle on full pay.
- **Time** — the network trades one day for every day you work a corner by hand,
  so the empire earns exactly as fast as you play.

## Project layout

```
index.html              app shell
css/styles.css          all styling, light + dark
js/sim.js               day simulation, modifiers, and the reference player
js/campaign.js          cities, corners, tiers, targets, progression
js/ops.js               depots, wholesale, staffing, the daily network tick
js/store.js             shared state and the save file
js/app.js               router, HUD, input
js/ui/                  screens: map.js, run.js, opsui.js, kit.js
tests/                  45 tests across the rules, the campaign and operations
tools/make-icons.mjs    regenerates icons/*.png from icons/icon.svg
```

`sim.js`, `campaign.js` and `ops.js` are pure and DOM-free, so the whole game can
be played and balanced from node. The same seed always replays the same season.

```bash
npm test           # 45 tests
npm run icons      # rebuild PNG icons from the SVG (needs headless Chromium)
```

Two constants set how long the campaign runs, in `js/campaign.js`:
`CORNERS_TO_TAKE_CITY` (how much of a city you must claim to take it) and
`CITIES_FOR_OPS` (how many cities unlock the supply chain).

Progress saves to `localStorage` after every action. **Free Play** — the original
open-ended 30-day season with nothing stacked against you — is still on the menu.
