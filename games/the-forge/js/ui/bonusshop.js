/**
 * The Forge's bonus list.
 *
 * The shop itself — the ad gate, the cooldowns, the screen and the
 * disclaimer — is the shared shell in js/bonusshop/, identical in every game
 * in the series. All that belongs here is what a small boost means to a smith
 * halfway through a commission, and when it is worth offering.
 *
 * Every bonus is a top-up, not a lever: nothing here tells you what heat the
 * metal wants, and nothing here banks a fire overnight. If four ads ever beat
 * reading the foreman properly, the rewards here are too big.
 */
import { store, render } from '../store.js';
import { createBonusShop } from '../bonusshop/shell.js';
import * as S from '../sim.js';
import { money, count } from './kit.js';

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const inCommission = () => (store.run && store.run.phase !== 'gameover'
  ? { ok: true }
  : { ok: false, why: 'Only useful mid-commission — take one first.' });

/** An advance is sized to the shop, so a jobbing bench and a mill both feel it. */
const advanceFor = (r) => round2(Math.max(0.5, r.retainer * 0.9));

const BONUSES = [
  {
    id: 'advance',
    icon: '💰',
    title: 'Buyer’s Advance',
    describe: () => (store.run ? `+${money(advanceFor(store.run))} into the purse, paid up front.` : 'A one-off advance against the commission.'),
    available: inCommission,
    apply: () => { store.run.coin = round2(store.run.coin + advanceFor(store.run)); },
  },
  {
    id: 'coke',
    icon: '⚫',
    title: 'A Ton of Coke',
    describe: () => {
      const last = store.run?.history?.at(-1);
      return last ? `Half of last shift’s ${money(last.spend)} set-up, refunded at the coal merchant.` : 'Half of last shift’s set-up, refunded.';
    },
    available: () => {
      const s = inCommission();
      if (!s.ok) return s;
      const last = store.run.history.at(-1);
      return last && last.spend > 0 ? { ok: true } : { ok: false, why: 'Nothing was spent last shift.' };
    },
    apply: () => {
      const r = store.run;
      r.coin = round2(r.coin + 0.5 * r.history.at(-1).spend);
    },
  },
  {
    id: 'dies',
    icon: '🛠️',
    title: 'Second-Hand Dies',
    describe: () => (store.run
      ? `Two die sets in the rack tomorrow — ×${(1 + S.DIE_GAIN * 2).toFixed(2)} on everything, and no cutting bill.`
      : 'Two die sets, in the rack tomorrow, with nothing to pay for the cutting.'),
    available: inCommission,
    apply: () => {
      // Straight into the queue: bought, not cut, so the tool room is not held
      // up — but they wear and want keeping true like any other set.
      store.run.dieQueue.push({ shift: store.run.shift + 1, sets: 2 });
    },
  },
  {
    id: 'striker',
    icon: '💪',
    title: 'A Striker for the Day',
    describe: () => (store.run
      ? `Someone else on the sledge: ${count(S.handCap(store.run) / 2)} swings banked without lifting a finger.`
      : 'Half a shift of swings, banked without lifting a finger.'),
    available: () => {
      const s = inCommission();
      if (!s.ok) return s;
      const r = store.run;
      return r.hands < S.handCap(r) ? { ok: true } : { ok: false, why: 'You have already swung all you can this shift.' };
    },
    apply: () => {
      const r = store.run;
      r.hands = Math.min(S.handCap(r), r.hands + S.handCap(r) / 2);
    },
  },
  {
    id: 'rest',
    icon: '🍺',
    title: 'A Round at the Inn',
    describe: () => (store.run
      ? `Morale from ${Math.round(store.run.morale * 100)}% up a few points. The shop swings harder tomorrow.`
      : 'A few points of morale back into the shop.'),
    available: () => {
      const s = inCommission();
      if (!s.ok) return s;
      return store.run.morale < 0.97 ? { ok: true } : { ok: false, why: 'The shop is already in fine spirits.' };
    },
    apply: () => { store.run.morale = clamp(store.run.morale + 0.08, 0.1, 1); },
  },
  {
    id: 'stock',
    icon: '🧲',
    title: 'A Load of Offcuts',
    describe: () => (store.run
      ? `${count(S.handCap(store.run) * 2)} swings' worth of stock in the yard, paid for by somebody else.`
      : 'A yard full of offcuts — free stock for the next shift or two.'),
    available: inCommission,
    apply: () => { store.run.offcuts += S.handCap(store.run) * 2; },
  },
];

export const { screens, actions } = createBonusShop({
  store,
  render,
  bonuses: BONUSES,
  storageKey: 'the-forge-bonusshop-v1',
});
