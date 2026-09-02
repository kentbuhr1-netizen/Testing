# 📒 The Ledger

A country banking game. **25 towns across Britain, 25 books each.** You get a
stake of your own capital, a pile of other people's deposits, and a queue of
people who would like to borrow some of it.

They come to the desk **one at a time**. You approve or you decline, and you
cannot take it back. You never see who is behind the person in front of you,
so you cannot wait and skim the best of the week — you have to decide what a
good loan looks like and hold to it while things walk past you.

Then you find out you were wrong, about four months later.

Built to play on a phone: one static page, no build step, no framework, no
network calls. Add it to your home screen and it runs offline.

## Play it on your phone

```bash
npm start          # serves the repository on http://localhost:8083
```

Then open `http://<your-computer's-LAN-ip>:8083/games/the-ledger/` on your
phone and **Add to Home Screen** to install it.

> The game is loaded as ES modules, so it must be served over http(s).
> Opening `index.html` straight off the filesystem will not work.

## The week

1. **Monday** — the balance sheet, what is due back, and what the town is
   likely to want out. The withdrawal figure is a range, not a number.
2. **The desk** — the files, one at a time. Approve or decline.
3. **Friday** — repayments land, somebody stops paying, and the town decides
   how much of its money it would like back.

The order matters and is the whole point: **you lend before you find out what
the town wants**. A week's withdrawals arrive after the money has gone out of
the door, and you cannot call a loan back in to cover them.

## What is hidden

Whether they will actually pay you. That number exists, it is fixed by the
seed before you make a single decision, and it is **never printed**. You get
four readings on it and all of them are noisy:

> *Books clean and current.*

> *Nobody here will vouch for them.*

> *The clerk says you could lend on their word alone.*

And the fourth is the rate. That one is not yours — it is what the **town**
thinks they are worth, and the town is a worse judge than a careful reader of
the other three. A fat rate on a file that reads well is where the money in
this game is. It is also, most of the time, a trap.

## Two ways to die, and they are different mistakes

**Lend badly** and the defaults eat your capital until there is none left, and
the examiner winds you up.

**Lend too much** — of perfectly good loans — and something else kills you.
Deposits can be withdrawn whenever the town likes. Loans cannot be called in;
they pay interest weekly and hand back the principal in one piece at the end
of the term, and not a week sooner. Put out the money you were holding against
a bad week and a completely solvent bank still dies the Friday everyone queues
up. Approving a good loan and approving too many good loans are not the same
error, and only one of them shows up on the profit line.

## Confidence

Confidence decides whether money flows in or out. It rises a couple of points
in a quiet week and **collapses the moment you cannot pay somebody** — a full
shortfall costs about three-quarters of it in an afternoon.

There is nothing in the game that buys it back. No amount of cash in the safe
makes it return one point faster; there is a test that asserts exactly that.
That is the thing that cannot be stockpiled, and it is why the bank cannot be
made safe simply by getting rich.

## The campaign

**Four tiers.** Each town's 25 books run 🟢 Easy ×7, 🟡 Medium ×7, 🟠 Hard ×7,
🔴 Impossible ×4 — less capital, worse paper and a jumpier town as you climb.

**Targets are measured, not guessed.** Before a book is offered, a family of
49 reference underwriters (`parProfit` in `js/sim.js`) each plays that exact
book — its applicants, its rates, its frights — and the target is a share of
what the best of them cleared: 40% on Easy up to 93% on Impossible. A test
asserts that for all 625.

Every bot in that family reads only what a player can read. None of them may
touch `quality`, `risk` or `defaultAt`, and there is a test that strips those
fields off an application and requires every policy to keep working without
them. A target measured against an oracle would not be a target.

**Nothing moves under you.** The applicants, what they ask for, what they are
charged, whether they go under and in which week are all rolled at the start
from the seed. So are the town's frights. Retry a book and exactly the same
people walk in — a book you lost is a puzzle you can learn.

**Every town bends one rule.** Ashgrove is all cousins and nobody will say a
word against a neighbour, so the files tell you very little. Ironbridge Vale
sends four applications a week and each is a third of the safe. Portmarne's
deposits come and go with the tide. Kingsford has sound names and rates so
thin you can see through them. Cadwell prices everybody wrong in both
directions, which is either the best town in the game or the worst. Kirkwald
has no security, no information, no patience and a fright every other week.

Towns open two at a time, so there is always somewhere else to go.

## The network (after 5 towns)

Books you hold can be put to work: open a **branch**, ship cash out to its
vault, and station **managers** on books you already hold. The network runs one
day for every week you work a book by hand, so it grows exactly as fast as you
play.

Cash stacks in a vault as high as you care to build it, and a bigger vault is
one payment away. **Standing is not for sale.** A branch opens at 30% and
climbs two points a day, and a branch earns in proportion to it — so a new
branch loses money for its first three weeks and there is nothing you can buy
to shorten that. The morning a vault runs dry the branch has to turn somebody
away, and its standing goes to zero in one tick and takes fifty days to come
back.

| Managers | Standing 30% | 70% | 100% |
|---|---|---|---|
| 1 | −$4.03/day | −$0.07 | **+$2.90** |
| 2 | −$5.67/day | +$1.45 | **+$6.78** |
| 3 | −$7.01/day | +$3.65 | **+$11.64** |

A network that over-extends can be wound back in: dismiss the managers, then
close the branch. The vault comes home. The standing does not.

## The bonus shop

Every game in the series has one — a few small boosts, each unlocked by
watching a short ad rather than paying. The shell is
[`shared/bonusshop`](../../shared/bonusshop); all that lives here is the list.

**Not one of the four grants a penny of score, and that is the whole point.**
This is a game about judging what you cannot see, so a bonus that handed over
capital would let a player buy a book instead of reading it. That is not a
worry in the abstract — it was measured. A $25 top-up claimed eight times
would have won **29% of all 625 books outright**, three of them on Impossible,
without a single good decision. So the shop sells help *playing*:

| | | |
|---|---|---|
| ⏳ | **Sleep On It** | Send whoever is at the desk to the back of today's queue and see the rest first. The one place the core loop bends — for one file, once, and only while somebody is still behind them. |
| 🔍 | **A Second Opinion** | A fifth reading on the applicant in front of you. Drawn from the run's own seed and cached on the file, so asking twice or reloading cannot reroll it into a better answer — and like the other four readings, it can be wrong. |
| 📅 | **Word From The Clearing House** | Exactly what the town will withdraw this week, before you lend it. Knowable because confidence and deposits only move at settlement and the frights were rolled from the seed; `settleWeek` uses the very same function, so the two cannot drift apart. |
| 🏦 | **A Correspondent's Deposit** | $400 placed with you by another bank. It lands on *both* sides of the sheet, so it buys liquidity — the thing this game is actually short of — and changes your capital by nothing at all. It still costs you the interest and the extra call risk. |

A test applies all four effects at once and asserts capital has not moved.

## Project layout

```
index.html              app shell
css/styles.css          all styling, light + dark
js/sim.js               the week, the file, and the reference underwriters
js/campaign.js          towns, books, tiers, targets, progression
js/ops.js               branches, vaults, managers, the daily tick
js/store.js             shared state and the save file
js/app.js               router, HUD, input
js/ui/                  screens: map.js, run.js, opsui.js, bonusshop.js, kit.js
tests/                  90 tests across the model, the campaign, the network
                        and the bonus shop
tools/make-icons.mjs    regenerates icons/*.png from icons/icon.svg
```

`sim.js`, `campaign.js` and `ops.js` are pure and DOM-free, so the whole game
can be played and balanced from node. The same seed always replays the same
book.

```bash
npm test           # 90 tests
npm run icons      # rebuild PNG icons from the SVG (needs headless Chromium)
```

Two constants set how long the campaign runs, in `js/campaign.js`:
`BOOKS_TO_TAKE_TOWN` and `TOWNS_FOR_OPS`.

Progress saves to `localStorage` after every action. **Free book** — one
open-ended twenty-week book with no target — is also on the menu.

## A note on the balancing

The numbers here were measured, not guessed, and the measuring changed the
design four times.

**Par across all 625 books** — min $22, median $502, 95th percentile $1,120.
No book has a par at or below zero, which is what makes the target invariant
hold everywhere.

**No naive strategy comes close.** Every one of these is a member of the
reference family, so none of them *can* beat par; the question is how far
short they fall. Averaged over all 625 books, as a share of par:

| Strategy | Share of par |
|---|---|
| Approve everything | **−40%** |
| Decline everything | **−49%** |
| Approve only the safest-looking | **0% to +8%** |
| Threshold on the rate | **−54% to −55%** |

All four lose money or barely break even, against an Easy target of 40% of
par. Put in cash on one representative set of books: reading the file clears
**$326**, taking only the safest-looking names clears **$39**, chasing the
highest rates loses **$88**, approving everybody loses **$77**, and approving
nobody loses **$199**.

That last one matters as much as the first. Depositors are paid interest and
the branch costs money to keep open, so **doing nothing is the second-worst
strategy in the game**. There is no safe option; there is only judgement.

The optimum is an interior one, which is how you know the family brackets it
rather than running out at its own edge:

| Acceptance bar | Approves | Loans a book | Profit |
|---|---|---|---|
| 0 (everything positive) | 37% | 46 | $234 |
| 0.05 | **29%** | **36** | **$361** |
| 0.12 | 9% | 12 | $102 |
| 0.16 | 4% | 5 | −$56 |

### Four things the measuring changed

**Loans used to amortise, and the liquidity half of the game did not exist.**
With principal trickling back weekly, cash flowed in faster than it could be
lent and the bank never got below 27% reserves — across forty runs there was
not a single week where it failed to pay somebody. The reserve setting made
*no difference at all* to the reference bots. Loans became bullet loans:
interest weekly, principal in one piece at maturity. Now the money is genuinely
gone for the term, reserves fall to 2% under an aggressive bot, and the run
risk is real.

**The market priced risk correctly, so there was nothing to find.** If the
rate exactly compensates for the risk, every loan is worth the same and
reading the file earns you nothing. The fix is the spread a real bank actually
lives on: the town prices everybody as if they were rather worse than they
are (`RISK_WEDGE`). That made most files worth writing — so what stops you is
no longer the bar but the safe, and choosing *which* good loans to fund became
the job.

**Judgement was losing to luck.** In an early cut the best bot wrote six loans
in a fourteen-week book, two went bad, and the run was decided. A naive policy
topped the whole reference family on **52%** of books, which means reading the
file was worth nothing on half of them. The cause was that a default cost the
whole principal regardless of term while the interest scaled with it, so short
loans were strictly bad and the bots hoarded. Making default a **weekly hazard**
— so a longer loan has proportionally longer to go wrong — made term
EV-neutral, pushed acceptance from 8% to 29%, and put 36 loans in a book
instead of 6. Naive-tops-the-family fell to 17%.

**One knob was secretly two.** `noise` scaled both how unreadable the files
were *and* how badly the town priced its rates — and those pull in opposite
directions. A "hard" opaque town was quietly the most profitable in the game,
because mispricing is exactly the thing a good reader eats. They are now
separate: `noise` blurs what you can read and lowers par; `mispricing` blurs
what the town charges and raises it. Ashgrove is hard. Cadwell is a gold mine
for anyone who can actually read a man.

### What ruin looks like

The liquidity threat is not decorative, and it is a property of the town rather
than of the strategy. Running the best policy with almost no reserve, over
sixty books each:

| Town | Runs ending with the doors shut |
|---|---|
| Calm | **0 / 60** |
| Ordinary | **0 / 60** |
| Restless deposits | **10 / 60** |
| Restless and skittish | **15 / 60** |

Worth being honest about one thing: the reference bots maximise *average*
profit, and on that measure running thin is very nearly free in a calm town.
A player cannot think that way, because a bank that fails loses the book
outright rather than scoring badly. The bots are therefore a slightly reckless
opponent, and the targets they set are beatable by someone more careful than
they are.

### Played in a real browser

A full fourteen-week book driven end to end in headless Chromium, and won —
using a strategy computed **only from what is printed on the file card**,
which is the check that the screen actually shows you enough to play well. It
cleared $235.69 against a target of $127. The same harness playing on
keywords alone — "clean books, good word" — cleared $86.54 and lost. Banked
the book, reloaded the page, and the career resumed with it held.

Reloading **part-way through a week's queue** — the thing a phone actually
does to you — comes back to the same applicant, with the same terms, the same
four readings, the same place in the queue and the same balance sheet. The
only thing that does not survive is the "you just approved so-and-so" line,
which is view state and should not.

Then the network: a branch opened, cash shipped with the stepper, a manager
hired, a book played, and the daily tick confirmed — 26 loans over 14 days,
the vault down from $5,000 to $3,628, standing climbing to 100%. No console
errors anywhere, in light or dark.
