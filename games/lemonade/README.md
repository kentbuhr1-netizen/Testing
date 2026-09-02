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
   Unpoured ice **melts overnight**; lemons **spoil after 7 days** in the
   cooler (tracked as dated batches, oldest used first); everything else keeps.
3. **The stand** — set the recipe (per 10-cup pitcher), the price per cup, and
   which stocked enhancers you're offering today.
4. **Open up** — each passer-by decides whether your lemonade is worth the ask,
   then separately decides whether to add an enhancer for a little more.

Heat sells, taste is a hidden target you learn from customer grumbles, and every
cent of price costs you customers. Reputation compounds, and the last stretch to
a perfect one is the hardest to earn.

**Enhancers** are an optional upsell, stocked and priced separately from the
core drink: 🍓 Strawberry Splash, 🥭 Mango Twist, 🌿 Mint Cooler (sells better
on hot days), and ☕ Caffeine Kick. Buy stock, switch one on at the stand, and
some fraction of buyers take it for the extra charge — running out never turns
away a base sale, it just means fewer add-ons that day.

**Cup sizes** — 🥤 Small (paper), 🧋 Medium, and 🧋 Large (styrofoam) are
stocked and priced independently, each drawing on the same pitcher of
lemonade but pouring a different amount of it. Accept 🌱 **Bring Your Own
Cup** and some customers skip a cup purchase entirely — pure margin, since
there's nothing to stock or wash.

**Card payments** are an optional toggle at the stand: switch it on and a
share of buyers who'd rather tap than dig for exact change pay a small
convenience fee on top of the price — set just above what it costs to
process, so offering the option costs you almost nothing either way. It
never changes how many cups sell, only how the same sales get paid for.

**Never-Expiring Lemons** is the one premium unlock in the game — reachable
from the buy screen once lemons start aging. There's no payment processor
wired into this static page, so it's built as an honest placeholder: a real
price, a real mechanic, and copy that says outright no card is charged. See
`js/store.js` and `js/ui/premium.js` for the hook a real IAP would plug into.

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
- **Farms & factories** — a Lemon Farm, Sugar Cane Farm and Cup Factory each
  press free stock into their city's depot every morning, up to a daily cap;
  an Ice Maker instead hands staffed corners a free daily allowance of ice
  before the street price applies. One of each per city, and every building
  costs upkeep whether or not it has anywhere to put its output. Grow one up
  to level 3 and both its output and its upkeep scale up with it.
- **Fleet** — 🛻 Pickup, 🚚 Box and 🚛 Semi trucks haul stock between depots in
  the *same* region (US↔US or EU↔EU), each tier costing more up front for a
  bigger daily cap. ✈️ Cargo Planes and 🚢 Cargo Ships do the opposite: they
  only cross *between* the US and Europe — a plane is the cheap, small
  option, a ship the expensive one that hauls far more.
- **Time** — the network trades one day for every day you work a corner by hand,
  so the empire earns exactly as fast as you play.

## The bank

Idle treasury cash can be deposited (`🏦 Bank`, from the World screen) to earn
interest — 0.5% a day, compounded for every day you spend working a corner,
campaign or free play alike. It is the same "a day played by hand is a day
everywhere" rule that drives the supply network: park cash you are not about
to spend on a depot or a truck, and it is worth more by the time you pull it
back out. Deposits and withdrawals are instant and free either way.

## The office

Five roles, hireable once each from an **Office** card inside Operations,
each a flat monthly-hire that turns into a small daily wage — paid the same
way the bank and the network already are, once per settled run, for exactly
the days that run took:

- **💹 Finance Manager** — the bank earns 0.2%/day more interest.
- **🧭 Logistics Manager** — depot and truck upkeep down 25%, wholesale orders down 5%.
- **🧑‍💼 HR Manager** — staff wages and hiring cost down 25%.
- **🧪 Flavor Scientist** — staffed corners earn 8% more from a better recipe.
- **🤝 M&A Specialist** — unlocks buying out an unclaimed corner outright,
  from its briefing screen, for three times its profit target — a shortcut
  for cash, not a bargain, and no operating profit since you didn't earn it.

Every effect is a plain multiplier that is exactly 1x — untouched — until
the relevant role is hired.

## Tutorial and achievements

A five-slide welcome sequence plays automatically the first time the page
loads, and is reachable again anytime from the title screen. It's a straight
explanation of the loop — nothing gated behind it, nothing to miss by
skipping.

Achievements (`js/achievements.js`) are a record of what you've actually
done — 50 of them, spanning first cup, first corner, clearing an
Impossible corner, winning every difficulty tier at least once, taking a
city, building every farm and factory in three cities, growing a farm to
its max size, routing a ship or plane overseas, selling your first
small/large/BYO/card-paid cup, your first bank deposit, hiring your whole
office, buying out a corner through M&A, going 50 or 100 or 365 days
without stopping, and going a whole run without a spoiled lemon — with no
reward attached beyond a small toast and a line on the list. They're
checked fresh from live game state after anything that could have earned
one, so there's nothing to keep in sync by hand.

## The shop

The campaign is sold, and the game decides what the free tier *is* while the
payments layer only decides whether it applies. `isCityFree` in `js/campaign.js`
is purely positional: the first three cities are free, everything past them is
bought. `FREE_TIER.lemonade` in `shared/payments/catalog.js` sets that number.

**Both fields in `js/payments.config.js` are blank on purpose.** Blank means no
shop server, which means no paywall, which means the complete game — every city,
every corner. That is the right state for running it yourself or working on it,
and it is why the game is finished rather than crippled. Fill `apiBase` and
`publicKey` in on a hosted copy and the cities past the free three start asking
to be bought.

A dead shop server, an offline start and an unconfigured build all resolve to
"carry on": entitlements are read before the first paint so an owner never sees
a locked map flash past, and any failure there is swallowed rather than allowed
to stop the game from starting.

Note that this is separate from the in-game **premium unlock** (`js/ui/premium.js`)
and the **bonus shop** — those are demo unlocks spending in-game currency and
progress, with no processor behind them.

## Project layout

```
index.html              app shell
css/styles.css          all styling, light + dark
js/sim.js               day simulation, modifiers, and the reference player
js/campaign.js          cities, corners, tiers, targets, progression
js/ops.js               depots, wholesale, staffing, the daily network tick
js/bank.js              deposits, withdrawals, and daily-compounding interest
js/employees.js         the five office roles and their passive effects
js/achievements.js      the achievement catalog and its unlock rules
js/store.js             shared state, the save file, stats and unlocks
js/app.js               router, HUD, input
js/ui/                  screens: map.js, run.js, opsui.js, bankui.js,
                         premium.js, tutorial.js, achievements.js,
                         bonusshop.js, kit.js
js/payments.config.js   where this build's shop lives (blank = no paywall)
js/payments/            the shop client, copied in by tools/sync-payments.mjs
tests/                  139 tests across the rules, the campaign, operations, the bank and the office
tools/make-icons.mjs    regenerates icons/*.png from icons/icon.svg
```

`sim.js`, `campaign.js`, `ops.js`, `bank.js`, `employees.js` and
`achievements.js` are pure and DOM-free, so the whole game can be played and
balanced from node. The same seed always replays the same season.

```bash
npm test           # 139 tests
npm run icons      # rebuild PNG icons from the SVG (needs headless Chromium)
```

Two constants set how long the campaign runs, in `js/campaign.js`:
`CORNERS_TO_TAKE_CITY` (how much of a city you must claim to take it) and
`CITIES_FOR_OPS` (how many cities unlock the supply chain).

Progress saves to `localStorage` after every action. **Free Play** — the original
open-ended 30-day season with nothing stacked against you — is still on the menu.
