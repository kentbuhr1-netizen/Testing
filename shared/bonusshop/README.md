# The Bonus Shop

A handful of small boosts, each unlocked by watching a short video ad instead
of paying for it. **Every game in the series has one.**

There is no ad network wired into these builds — they are static pages with no
server. This is the real hook a shipped app would plug an AdMob rewarded ad
into: load a `RewardedAd`, call `show()`, and grant the bonus from its
`onUserEarnedReward` callback in place of the timed stand-in. The bonus list,
the reward amounts and the per-bonus cooldown are the real design; only
"watching an ad" is simulated.

This is **not** the paywall. `shared/payments` sells the campaign for money.
The bonus shop gives things away for attention, and the two are independent —
a player who owns the full game still has a bonus shop.

## What is shared and what is not

The shell is identical everywhere so the cooldown behaviour, the ad gate and
the disclaimer cannot drift apart game by game. **Only the bonus list is
per-game**, because a free restock means nothing in a game with no inventory.

```
client/core.js    which bonuses are claimable and what claiming does — DOM-free
client/shell.js   the screen, the ad stand-in, the actions
tests/            11 tests over the core
```

Both files are **copied** into each game by `tools/sync-payments.mjs`, exactly
as the payments client is, and for the same reason: a service worker only
intercepts requests inside its own scope, so a game importing `../../shared/…`
would work on a desktop and fail on a plane. Edit the shared copy, never the
copy inside a game — `--check` fails the build if they drift.

## Adding one to a game

Write `js/ui/bonusshop.js` in the game, and let it be nothing but the list:

```js
import { store, render } from '../store.js';
import { createBonusShop } from '../bonusshop/shell.js';

const midRunOnly = () => (store.run ? { ok: true } : { ok: false, why: 'Only useful mid-run — start one first.' });

const BONUSES = [
  {
    id: 'cash',                       // stable — it is the cooldown key
    icon: '💰',
    title: 'Quick Cash',
    describe: () => '+$15, straight into your pocket.',
    available: () => (store.run ? { ok: true } : { ok: false, why: 'Start a run first.' }),
    apply: () => { store.run.money += 15; },
  },
];

export const { screens, actions } = createBonusShop({
  store,
  render,
  bonuses: BONUSES,
  storageKey: 'my-game-bonusshop-v1',   // must be unique per game
});
```

Then register `screens` and `actions` in the game's `app.js`, put a
`data-act="open-bonus-shop"` button on the title screen, and add
`js/bonusshop/core.js` and `js/bonusshop/shell.js` to the service worker's
cached assets.

## Rules the shell already enforces, so a game does not have to

- **Availability is re-checked when the ad finishes**, not when the button was
  drawn. A run can end while an ad plays; the bonus is then not granted.
- **`apply()` runs at most once per claim**, and never while unavailable or on
  cooldown.
- **Cooldowns are per bonus**, not per shop — claiming one leaves the rest ready.
- **Storage never breaks a claim.** Private mode, a denied storage API and
  corrupt JSON all degrade to "cooldowns are not remembered", which is a far
  better failure than a shop that throws.

## Writing good bonuses

Keep them small and keep them situational. The bonus shop is a top-up, not a
second economy — if watching four ads beats playing well, the game is broken.
Each bonus should say plainly why it is unavailable (`why` is shown to the
player), and `describe()` is called fresh on every render so it can quote live
numbers.
