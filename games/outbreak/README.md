# 🦠 Outbreak

An epidemic containment game. **25 regions across the world, 25 districts
each.** You are handed one district, a pathogen nobody has characterised yet,
and a budget that is never enough. Save enough lives and the next district
opens. Take all 25 and the region is clear. Clear five regions and you stop
working district by district — you build laboratories and station teams.

Built to play on a phone: one static page, no build step, no framework, no
network calls. Add it to your home screen and it runs offline.

## Play it on your phone

```bash
npm start          # serves this folder on http://localhost:8081
```

Open `http://<your-computer's-LAN-ip>:8081` on your phone, then **Add to Home
Screen** to install it.

> The game is loaded as ES modules, so it must be served over http(s).
> Opening `index.html` straight off the filesystem will not work.

## The week loop

Every district is played a week at a time — though the disease is simulated a
day at a time inside each week, so the curves behave:

1. **Briefing** — active cases, ward load, what the public will still tolerate,
   and last week's surveillance notes.
2. **Measures** — set four levers. Everything you fund is owed this week,
   whatever it achieves.
3. **Seven days run** — exposures, incubation, wards, deaths.

## The four levers, and why they fight each other

| | |
|---|---|
| 🔬 **Test & trace** | Strong early, worthless once the labs are swamped. The reach figure tells you when it has stopped working. |
| 🚧 **Distancing** | The only lever that costs no budget — and the most expensive one you have. It starves the tax base that pays for the other three, and it burns public patience, which is the only thing that makes it work at all. |
| 💉 **Vaccination** | Takes weeks to land. Decisive if you start it early, worthless if you start it late. |
| 🏥 **Hospital beds** | Changes nothing about the spread and everything about the dying. Beds open a week *after* you fund them. |

Compliance is the hinge. Close everything and it drains in a fortnight, at
which point your closures are symbolic and your budget is gone. Rising deaths
frighten people back into line — always a week too late to help.

## The pathogen is hidden

Eight archetypes, from a fast ordinary flu to a mosquito-borne fever that does
not care what you close. Two numbers decide almost everything — how traceable
it is, and how much it spreads person to person — and **neither is ever
printed**. You read them off the weekly surveillance notes instead. A lever
doing nothing will say so:

> *Everything is shut and the curve has barely noticed. This is not spreading
> person to person.*

> *Contacts keep testing positive before they ever felt ill — tracing arrives
> too late.*

## The campaign

**Four tiers.** Each region's 25 districts run 🟢 Easy ×7, 🟡 Medium ×7,
🟠 Hard ×7, 🔴 Impossible ×4 — thinner budgets, tireder publics and a longer
head start as you climb.

**Targets are measured, not guessed.** Before a district is offered, a family
of 48 reference policies (`parSaved` in `js/sim.js`) each plays that exact
district — its pathogen, its density, its hospitals — and the target is a share
of what the best of them saved: 40% on Easy up to 93% on Impossible. A
mosquito-borne outbreak in a district with no laboratories therefore asks for
less than a traceable flu in a rich one, and no district can ask for more than
it can actually give. A test asserts that for all 625.

**You are scored on lives saved** — the gap between the deaths a do-nothing
response produces and the deaths you produce. The do-nothing run is simulated
too, week by week, so the HUD can show the gap as you go.

**The outbreak never changes.** Retry a district and the same weeks come back,
so a district you lost is a puzzle you can learn rather than a dice roll.

**Every region bends one rule.** Seoul traces contacts better than anywhere on
earth. Miami will not close and will not comply. Buenos Aires makes every
closure eat the budget you needed. Lagos has almost no hospital to lose and the
youngest population in the campaign, which is a large and real advantage. Dhaka
is denser than anything else in the game. The district briefing spells out
exactly what you are walking into before you stake anything.

Regions open two at a time, so there is always somewhere else to go.

## The agency (after 5 regions)

Districts you hold can be put to work:

- **Laboratories** — one per region, holding vaccine doses.
  *Beds are never stockpiled, because a bed is a building*; stationed teams
  fund theirs locally.
- **Procurement** — doses by the million, with discounts at 200k / 500k / 1M.
- **Teams** — stationed on any district you hold. Wages and lab upkeep are owed
  every week, supplied or not, and a laboratory that runs dry leaves your teams
  standing on full pay at 40% effectiveness.
- **Time** — the agency runs one week for every week you work a district by
  hand, so it earns exactly as fast as you play.

## Project layout

```
index.html              app shell
css/styles.css          all styling, light + dark
js/sim.js               week simulation, pathogens, and the reference policies
js/campaign.js          regions, districts, tiers, targets, progression
js/ops.js               laboratories, procurement, teams, the weekly tick
js/store.js             shared state and the save file
js/app.js               router, HUD, input
js/ui/                  screens: map.js, run.js, opsui.js, kit.js
tests/                  42 tests across the model, the campaign and the agency
tools/make-icons.mjs    regenerates icons/*.png from icons/icon.svg
```

`sim.js`, `campaign.js` and `ops.js` are pure and DOM-free, so the whole game
can be played and balanced from node. The same seed always replays the same
outbreak.

```bash
npm test           # 42 tests
npm run icons      # rebuild PNG icons from the SVG (needs headless Chromium)
```

Two constants set how long the campaign runs, in `js/campaign.js`:
`DISTRICTS_TO_TAKE_REGION` (how much of a region you must hold) and
`REGIONS_FOR_OPS` (how many regions unlock the agency).

Progress saves to `localStorage` after every action. **Free response** — a
single open-ended 14-week outbreak with no target — is also on the menu.

## A note on the model

This is a game, not an epidemiological tool. It is an SEIR model with a handful
of policy levers bolted on, tuned until the decisions were interesting. The
mechanisms it does take seriously are the ones that make those decisions hard:
tracing that collapses under caseload, immunity that arrives on a delay, wards
whose overflow is what actually kills people, and public patience as a
consumable resource. Do not plan a public health response with it.
