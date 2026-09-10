/**
 * Gadget Factory's bonus list.
 *
 * The shop itself — the ad gate, the cooldowns, the screen and the
 * disclaimer — is the shared shell in js/bonusshop/, identical in every game
 * in the series. All that belongs here is what a small boost means to a
 * factory floor, and when it is worth offering.
 *
 * Every bonus is a top-up, not a shortcut to the multiplier itself: nothing
 * here hands out lifetime cash directly, only cash and components a floor
 * still has to turn into it.
 */
import { store, render } from '../store.js';
import { createBonusShop } from '../bonusshop/shell.js';
import * as S from '../sim.js';
import * as C from '../campaign.js';
import * as O from '../ops.js';
import { money } from './kit.js';

const round2 = (n) => Math.round(n * 100) / 100;

const onFloor = () => (store.ui.view === 'floor' && store.ui.tierId
  ? { ok: true }
  : { ok: false, why: 'Open a product line first.' });

const currentTierAndFloor = () => {
  const tier = C.getTier(store.ui.tierId);
  const floor = C.getFloor(store.campaign, store.ui.tierId);
  return { tier, floor };
};

const BONUSES = [
  {
    id: 'cashgrant',
    icon: '💰',
    title: 'Cash Injection',
    describe: () => 'A flat top-up to whichever floor is open — most useful early, before machines are earning much on their own.',
    available: onFloor,
    apply: () => {
      const { floor } = currentTierAndFloor();
      const grant = 50;
      floor.cash = round2(floor.cash + grant);
      floor.totalEarnedThisRun = round2(floor.totalEarnedThisRun + grant);
    },
  },
  {
    id: 'productionburst',
    icon: '⚡',
    title: 'Production Burst',
    describe: () => {
      if (store.ui.view !== 'floor' || !store.ui.tierId) return 'Ten minutes of the open floor’s current output, credited at once.';
      const { tier, floor } = currentTierAndFloor();
      const income = S.incomePerSecond(tier, floor, store.campaign.lifetimeCash);
      return `Credits ${money(income * 600)} — ten minutes of this floor's current output, right now.`;
    },
    available: () => {
      const s = onFloor();
      if (!s.ok) return s;
      const { tier, floor } = currentTierAndFloor();
      return S.incomePerSecond(tier, floor, store.campaign.lifetimeCash) > 0
        ? { ok: true } : { ok: false, why: 'This floor has no machines running yet.' };
    },
    apply: () => {
      const { tier, floor } = currentTierAndFloor();
      S.advance(tier, floor, 600, store.campaign.lifetimeCash);
    },
  },
  {
    id: 'freemachine',
    icon: '🎁',
    title: 'Free Machine',
    describe: () => 'One more unit of this floor’s first machine, at no cost.',
    available: onFloor,
    apply: () => {
      const { tier, floor } = currentTierAndFloor();
      const machine = tier.machines[0];
      floor.machines[machine.id] = (floor.machines[machine.id] || 0) + 1;
    },
  },
  {
    id: 'components',
    icon: '📦',
    title: 'Component Grant',
    describe: () => 'Free stock for the regional office warehouse.',
    available: () => {
      if (!store.campaign?.ops) return { ok: false, why: 'Regional offices are not open yet.' };
      return O.spaceLeft(store.campaign.ops.warehouse) > 0
        ? { ok: true } : { ok: false, why: 'The warehouse is already full.' };
    },
    apply: () => {
      const warehouse = store.campaign.ops.warehouse;
      warehouse.components = Math.min(warehouse.capacity, warehouse.components + 1000);
    },
  },
];

export const { screens, actions } = createBonusShop({
  store,
  render,
  bonuses: BONUSES,
  storageKey: 'gadget-factory-bonusshop-v1',
});
