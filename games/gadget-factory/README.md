# Gadget Factory

A manufacturing tycoon clicker. Tap the floor to assemble and sell a unit by
hand, buy machines that keep producing after you stop tapping, and buy
upgrades that make every tap and every machine worth more. Once a product
line has earned enough, prestige it: the floor resets, but every dollar you
ever earned becomes a permanent multiplier, and the next product line —
bicycles, scooters, cars, drones, spacecraft — opens up.

Machines run on electricity; tapping does not. Buying more machinery than
your grid connection can power wastes the extra output every second it goes
uncorrected — grid capacity is the one thing in this game that is never
banked for later. Once two product lines have had a first prestige, tiers
you have moved on from can be staffed with regional office managers instead
of left idle; those draw on a shared, stockpilable component warehouse, but
each office still runs on its own tier's local grid, which can never be
pooled from anywhere else.

## Playing it

```bash
npm start        # serves the whole repo on http://localhost:8084
```

Then open `/games/gadget-factory/`. On a phone, **Add to Home Screen**
installs it, complete with an icon, and it runs offline — including crediting
the machines that kept running while the app was closed.

## Working on it

```bash
npm test          # this game's tests
npm run icons     # rebuild the PNG icons from icons/icon.svg
```

From the repo root, `npm run check` runs the structural checks and every
game's tests, including this one — see the root `README.md` and `CLAUDE.md`
for the house rules the whole series shares.

## How the numbers are set

A tier's prestige threshold is not hand-picked. `js/sim.js` plays a greedy
reference bot — one that always spends on whatever buys the most extra
income per second per dollar, taps for a realistic active burst, then rides
out a few idle hours — against that tier's exact machine catalog, chained
tier to tier so a later product line is measured with the lifetime cash a
player would plausibly be carrying in from the one before it. The threshold
is a fixed share of what that bot finds achievable in one session, so no
tier can ask for more than a well-played session can actually give.
