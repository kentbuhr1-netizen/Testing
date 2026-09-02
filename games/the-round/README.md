# 🌱 The Round

A grass-cutting business game. **25 towns across Britain, 25 rounds each.**
You get a book of client lawns scattered across a map, about eight hours of
daylight, and grass that keeps growing whether or not you turn up.

The decision every morning is a route: which lawns, in what order. That is a
travelling-salesman problem with deadlines and decay bolted on — the far corner
pays well but costs you the drive, a lawn takes longer the longer you leave it,
and a client whose patience runs out is gone for the season along with their
money.

Built to play on a phone: one static page, no build step, no framework, no
network calls. Add it to your home screen and it runs offline.

## Play it on your phone

```bash
npm start          # serves the repository on http://localhost:8082
```

Then open `http://<your-computer's-LAN-ip>:8082/games/the-round/` on your phone
and **Add to Home Screen** to install it.

> The game is loaded as ES modules, so it must be served over http(s).
> Opening `index.html` straight off the filesystem will not work.

## The day

1. **Forecast** — the weather decides how much daylight you actually get. A
   downpour can leave you two hours and wet grass; sometimes the right move is
   to write the day off.
2. **The round** — tap lawns in the order you will drive them. The van starts
   and ends at the yard, and the map shows the loop you have built. Stops that
   will not fit before dark are greyed out.
3. **Work it** — and find out what people thought.

## Taking your time

Any stop on the round can be given the time it actually needs — 30% longer on
that lawn, and it shows in the finish. This is the only lever you have that is
*per client*, and it is the reason working out what somebody wants is worth
anything: a sharp blade on a dry day is a decent cut, not a perfect one, so the
fussiest clients cannot be satisfied any other way. Everybody else is a waste
of your afternoon, and they will tell you so.

> *Looks like you were in a hurry.*

> *You could have been in and out.*

## Your name

A round holds more lawns than there is daylight to cut them, so on its own a
cancellation costs you nothing — you mow somebody else instead. That is what
made every hidden thing about a client decorative in an earlier draft of this
game. What a lost contract really costs a one-van business is its name, and a
name is worth money on every lawn: each client who walks takes 9% off what you
are paid for the rest of the season, and pleasing people earns it back slowly.

## Grass has to have grown

A visit only pays if there is something to cut. Turn up two days after you were
last there and you have spent an hour for nothing and mildly irritated someone.
Leave it too long and the lawn takes longer, the finish is worse, and they start
asking around.

This one rule is what makes the game a routing problem rather than a spreadsheet.
Without it the optimum is to mow the three nearest lawns every single day.

## What is hidden

Every client has an interval they expect you at and a standard they expect, and
**neither is ever printed**. You read them off what people say afterwards:

> *It was getting a bit shaggy.*

> *Looks like you were in a hurry.*

> *They came out to say it looks a picture.*

The patience bar beside each name is the only warning you get. At zero they
cancel, and they do not come back.

## The blade

Sharpening costs 25 minutes you could have spent mowing, and a few dollars. A
blunt blade mows measurably slower and leaves a finish that drops below what
fussy clients will accept — and people forgive a good cut far more readily than
they forgive a bad one, so a season of tearing the grass costs you contracts
rather than just minutes.

## The campaign

**Four tiers.** Each town's 25 rounds run 🟢 Easy ×7, 🟡 Medium ×7, 🟠 Hard ×7,
🔴 Impossible ×4 — shorter float, fussier clients and faster-blunting blades as
you climb.

**Targets are measured, not guessed.** Before a round is offered, a family of 26
reference routers (`parProfit` in `js/sim.js`) each plays that exact round — its
distances, its weather, its clients — and the target is a share of what the best
of them cleared: 40% on Easy up to 93% on Impossible. A test asserts that for
all 625.

The family crosses three routers — nearest hop, best return per minute, and
nearest-then-untangled — with three ways of deciding who gets the extra time:
never, whenever the finish looks like heading for trouble, and knowing what each
client will accept. Taking the time sets par on 28 of 52 sampled rounds, which
is the measurement that says the hidden standard is doing work.

**The weather never changes.** Retry a round and the same season comes back, so
a round you lost is a puzzle you can learn rather than a dice roll.

**Every town bends one rule.** Fairhaven is handkerchief lawns packed tight.
Oakridge is strung out along five miles of B-road. Draycott coats everything in
quarry dust and eats blades. Elmsworth's one-way system turns two hundred yards
into twenty minutes. Pinehurst is a handful of estates that pay like a week
each. Cranmoor is sodden, vertical, gritty and scattered, and they still expect
a stripe. The briefing spells out exactly what you are walking into.

Towns open two at a time, so there is always somewhere else to go.

## The firm (after 5 towns)

Rounds you hold can be put to work:

- **Yards** — one per town, holding fuel and blades.
- **Supplies** — by the pallet, with discounts at 500 / 1,500 / 4,000 units.
- **Crews** — stationed on any round you hold. Wages and yard upkeep are owed
  every day, supplied or not, and a yard that runs dry leaves crews on full pay
  doing 45% of a day's work.
- **Time** — the firm runs one day for every day you work a round by hand, so
  it grows exactly as fast as you play.

*Daylight is the one thing a yard cannot stock.* Fuel and blades stack to the
roof; hours do not, and a crew that runs out of day cannot bank it. That is why
a second crew — never a bigger order — is the only way to cut more grass.

A firm that over-extends can be wound back in: lay the crews off, then close the
yard. Upkeep stops the moment you do.

## Project layout

```
index.html              app shell
css/styles.css          all styling, light + dark
js/sim.js               the day, the round, and the reference routers
js/campaign.js          towns, rounds, tiers, targets, progression
js/ops.js               yards, supplies, crews, the daily tick
js/store.js             shared state and the save file
js/app.js               router, HUD, input
js/ui/                  screens: map.js, run.js, opsui.js, kit.js
tests/                  58 tests across the day, the campaign and the firm
tools/make-icons.mjs    regenerates icons/*.png from icons/icon.svg
```

`sim.js`, `campaign.js` and `ops.js` are pure and DOM-free, so the whole game
can be played and balanced from node. The same seed always replays the same
season.

```bash
npm test           # 58 tests
npm run icons      # rebuild PNG icons from the SVG (needs headless Chromium)
```

Two constants set how long the campaign runs, in `js/campaign.js`:
`ROUNDS_TO_TAKE_TOWN` and `TOWNS_FOR_OPS`.

Progress saves to `localStorage` after every action. **Free season** — one
open-ended twenty-day round with no target — is also on the menu.

## A note on the balancing

The numbers here were measured, not guessed, and several of them changed the
design after the fact.

- With a flat per-visit fee and no growth requirement, the optimum was mowing
  the same three lawns every day for $2,400 a season. Hence the due rule.
- With a short client list, the day was never full, so route order barely
  mattered — working blindly down the list got **95%** of par. The round was
  enlarged and travel made expensive until it stopped paying at all.
- Plain nearest-neighbour routing beat the entire reference family, scoring
  **101%** of par. Par was wrong, not the strategy, so nearest-neighbour went
  into the family and the targets moved with it.
- **The hidden client was decoration.** A bot that drove to the nearest ready
  lawn and ignored every cue — never sharpening, never lingering, never reading
  a word of the feedback — cleared Easy, Medium and most of Hard. Two things
  were wrong. A sharp blade satisfied everybody, so a discovered standard was a
  fact you could not act on; and the round was over-subscribed, so a client who
  walked was replaced by another lawn and cost nothing. Hence taking your time,
  and hence your name. The same bot now clears 13 of 13 Easy rounds, 7 Medium,
  1 Hard and no Impossible.
- **Untangling the route is worth 0.5%.** A 2-opt pass over the day's stops,
  with the freed time spent on more lawns, barely beats plain nearest-neighbour
  at matched settings. The day fits about eight of twenty candidate lawns, so
  this is a problem of *which* lawns rather than *what order* — which is also
  why no simple heuristic gets near par.

Each layer of attention is worth roughly one tier, measured over 52 rounds:

| how you play | Easy | Medium | Hard | Impossible |
|---|---|---|---|---|
| straight down the list | 12/13 | 2/13 | 0/13 | 0/13 |
| nearest ready lawn | 13/13 | 7/13 | 1/13 | 0/13 |
| …and sharpen the blade | 13/13 | 12/13 | 7/13 | 1/13 |
| …and take your time when it looks bad | 13/13 | 13/13 | 13/13 | 6/13 |
| …and know what each client wants | 13/13 | 13/13 | 13/13 | 7/13 |
