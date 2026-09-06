/**
 * Lemonade Stand's bonus list.
 *
 * The shop itself — the ad gate, the cooldowns, the screen and the
 * disclaimer — is the shared shell in js/bonusshop/, identical in every game
 * in the series. All that belongs here is what a boost means at a lemonade
 * stand, and when it is worth offering.
 */
import { store, render } from '../store.js';
import { createBonusShop } from '../bonusshop/shell.js';
import { ensureBank } from '../bank.js';
import { ENHANCERS, receiveLemons } from '../sim.js';
import { spaceLeft } from '../ops.js';
import { money } from './kit.js';

const round2 = (n) => Math.round(n * 100) / 100;

/** Adds stock to a depot without ever pushing it over capacity. */
function addDepotStock(depot, unit, amount) {
  depot.stock[unit] += Math.min(amount, spaceLeft(depot));
}

const midRunOnly = () => (store.run ? { ok: true } : { ok: false, why: 'Only useful mid-run — start one first.' });

const BONUSES = [
  {
    id: 'cash',
    icon: '💰',
    title: 'Quick Cash',
    describe: () => `+${money(15)} cash, straight into your pocket.`,
    available: () => (store.run || store.campaign
      ? { ok: true }
      : { ok: false, why: 'Start a campaign or free play first.' }),
    apply: () => {
      if (store.run) { store.run.money = round2(store.run.money + 15); return; }
      store.campaign.treasury = round2(store.campaign.treasury + 15);
    },
  },
  {
    id: 'restock',
    icon: '🍋',
    title: 'Free Restock',
    describe: () => '+10 lemons, +10 sugar, +20 cups — straight into today’s cooler.',
    available: midRunOnly,
    apply: () => {
      const r = store.run;
      receiveLemons(r, 10);          // dated like any other lemons, so they spoil like any other
      r.inventory.sugar += 10;
      r.inventory.cups += 20;
    },
  },
  {
    id: 'ice',
    icon: '🧊',
    title: 'Free Ice',
    describe: () => '+30 ice cubes, straight into today’s cooler.',
    available: midRunOnly,
    apply: () => { store.run.inventory.ice += 30; },
  },
  {
    id: 'enhancers',
    icon: '🍹',
    title: 'Enhancer Sample',
    describe: () => '+5 of every enhancer, free to offer at the stand.',
    available: midRunOnly,
    apply: () => {
      const inv = store.run.inventory.enhancers || (store.run.inventory.enhancers = {});
      for (const id of Object.keys(ENHANCERS)) inv[id] = (inv[id] || 0) + 5;
    },
  },
  {
    id: 'reputation',
    icon: '⭐',
    title: 'Reputation Boost',
    describe: () => 'Nudges today’s reputation up, so the street expects a bit more from you.',
    available: midRunOnly,
    apply: () => { store.run.reputation = Math.min(1, store.run.reputation + 0.12); },
  },
  {
    id: 'depot',
    icon: '📦',
    title: 'Depot Restock',
    describe: () => '+100 lemons, +100 sugar, +200 cups into one of your depots.',
    available: () => {
      const ops = store.campaign?.ops;
      if (!ops || Object.keys(ops.warehouses).length === 0) {
        return { ok: false, why: 'Build a depot in Operations first.' };
      }
      return { ok: true };
    },
    apply: () => {
      const ops = store.campaign.ops;
      const cityId = ops.warehouses[store.ui.cityId] ? store.ui.cityId : Object.keys(ops.warehouses)[0];
      const depot = ops.warehouses[cityId];
      addDepotStock(depot, 'lemons', 100);
      addDepotStock(depot, 'sugar', 100);
      addDepotStock(depot, 'cups', 200);
    },
  },
  {
    id: 'interest',
    icon: '🏦',
    title: 'Bank Bonus',
    describe: () => `+${money(10)} deposited straight into your bank balance.`,
    available: () => (store.campaign
      ? { ok: true }
      : { ok: false, why: 'Start a campaign first — free play has no bank.' }),
    apply: () => {
      const bank = ensureBank(store.campaign);
      bank.balance = round2(bank.balance + 10);
    },
  },
];

export const { screens, actions } = createBonusShop({
  store,
  render,
  bonuses: BONUSES,
  storageKey: 'lemonade-stand-bonusshop-v1',
});
