# 🔨 The Forge

A blacksmithing clicker. **25 cities of smiths, 25 workshops each.** You are
handed one workshop, a bar of metal nobody has told you anything about, and a
purse that runs out faster than the commission does. Deliver enough pieces and
the next workshop opens. Take all 25 and the city is yours. Clear five cities
and you stop working shop by shop — you open depots and station journeymen.

Built to play on a phone: one static page, no build step, no framework, no
network calls. Add it to your home screen and it runs offline.

## Play it on your phone

```bash
npm start          # serves this folder on http://localhost:8084
```

Open `http://<your-computer's-LAN-ip>:8084` on your phone, then **Add to Home
Screen** to install it.

> The game is loaded as ES modules, so it must be served over http(s).
> Opening `index.html` straight off the filesystem will not work.

## The shift loop

Every commission is worked a shift at a time — though the fire is simulated an
hour at a time inside each shift, because the heat is the whole game:

1. **The foreman** — what came off the anvil last shift, what the metal did
   under the hammer, and what the shop thinks of you.
2. **The bench** — set four levers. Everything you light or hire is owed this
   shift, whatever comes off the anvil.
3. **The anvil** — tap. Every tap is one swing of your own hammer, banked for
   this shift only, up to what one pair of arms has in it. Hold to keep swinging.
4. **Eight hours run** — the fire climbs, the hammers drag it back down, and
   the metal is either moving or being ruined the whole time.

## The four levers, and why they fight each other

| | |
|---|---|
| 🔥 **The bellows** | Ten notches, and exactly one of them is right for the metal on the bench. Nothing anywhere tells you which — see below. |
| 🧑‍🏭 **Apprentices** | Hands that are not yours, swinging all shift, wanting paying whether the work is any good or not. Tired ones swing less and ruin more. |
| 🛠️ **Die sets** | Tooling multiplies everything the shop makes. It arrives a shift late, it has to be kept true every shift after, and a share of the rack goes past truing every shift — so the rack is a treadmill, not a staircase. |
| ⏱️ **The pace** | The only lever that costs no money, and the most expensive one you have. It buys swings with morale and pays for them in scrap. |

## The metal is hidden

Every alloy has a **working heat** and a **window** either side of it, and
neither is ever printed anywhere in the game. You can see what colour your own
fire is running — dull red, cherry, orange, yellow. What you cannot see is what
colour *this* metal needs.

The foreman is how you find out:

> *The bar came off the fire dull and stiff. It fought the hammer, and most of
> it cracked.* — too cold.
>
> *Sparks everywhere. That was not metal moving — that was metal burning.* —
> too hot.
>
> *It moved like butter under the hammer. Whatever you did to that fire, do it
> again.* — you have found it.

One notch either way costs a fifth to a third of everything the shop makes, so
the first shift or two of any commission is an experiment you are paying for.

## Heat is never banked

The fire dies overnight. **Every shift starts at the same dull glow**, in every
workshop, however rich you are — and every hammer on the metal drags the fire
back down while you work, so a shop full of apprentices needs a hotter fire than
a shop with one. Heat is the one thing in this game that money cannot buy ahead,
which is what stops the guild quietly replacing the anvil.

## The eight alloys

| | | |
|---|---|---|
| 🔩 | Mild Steel | Forgiving, wide window, pays almost nothing |
| ⛓️ | Wrought Iron | Worked cool, and it eats fire |
| 🟠 | Bronze | Moves like nothing else — a hair too hot and it is a puddle |
| 🌀 | Spring Steel | Wants working hot and hates being asked twice |
| 💠 | Crucible Steel | Only to be had at the top of the fire |
| ⚙️ | Nickel Steel | Stiff, tough, and nothing shifts it but heat and good tooling |
| 🌊 | Pattern-Weld | Half a day of swinging a piece, and every piece sells |
| ☄️ | Meteoric Iron | Unforgiving, and worth a year of gates |

Which one is on the bench is told to you up front. Everything that matters
about it is not.

## The commission is measured, not guessed

No workshop's target was typed in by hand. A family of reference smiths works
each exact workshop — that city's coke, wages, weather and buyers, that shop's
size, that bar of metal — and the target is a share of what the best of them
delivers: 40% on Easy, 62% on Medium, 80% on Hard, 93% on Impossible.

The reference smith is allowed to know what heat the metal wants. You are not.
That gap is exactly what the share is for.

`tests/campaign.test.mjs` walks all 625 workshops and asserts none of them asks
for more than it can give. If a balance change turns that red, the change is
wrong.

## The guild

Hold five cities and the guild opens: **city depots** holding bar stock bought
by the ton, and **journeymen** stationed on workshops you already hold, turning
out work while you take a new commission by hand. The guild ticks one shift for
every shift you work, so the network runs exactly as fast as you do.

A journeyman may do anything a reference smith may do **except put your hands on
the hammer**. Your own swings are the one thing that cannot be delegated, which
is why the guild can never quite match you — and coke is never stockpiled, since
a fire is not a crate, so journeymen buy theirs locally at whatever the city
charges.

## The bonus shop

Six small boosts, each unlocked by watching a short ad instead of paying for it:
an advance against the commission, a ton of coke, second-hand dies, a striker on
the sledge, a round at the inn, a yard of offcuts. Every one is a top-up, never
a lever — nothing in the shop tells you what heat the metal wants, and nothing
in it banks a fire overnight.

There is no ad network in this build; "Watch Ad" plays a short timed stand-in
and says so on screen. See [`shared/bonusshop`](../../shared/bonusshop).

## Working on it

```bash
npm test           # the simulation, the campaign and the guild
npm run icons      # rebuild the PNG icons from icons/icon.svg
```

The simulation (`js/sim.js`), the campaign (`js/campaign.js`) and the guild
(`js/ops.js`) are pure and DOM-free — that is what lets the tests play and
balance the whole game headlessly. Seeded throughout: the same seed always
replays the same commission, so a workshop you lost is a puzzle you can learn
rather than a dice roll.

## Store app

`app/` is a [Capacitor](https://capacitorjs.com) shell that ships this game to
the App Store and Google Play as its own app. See [`app/README.md`](app/README.md)
for the parts no script can do.
