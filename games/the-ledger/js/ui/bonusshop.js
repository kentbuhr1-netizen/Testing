/**
 * The Ledger's bonus list.
 *
 * The shop itself — the ad gate, the cooldowns, the screen and the disclaimer
 * — is the shared shell in js/bonusshop/, identical in every game in the
 * series. All that belongs here is what a boost means at a bank.
 *
 * **Not one of these grants a penny of score**, and that is deliberate. The
 * game's whole claim is that there is no safe option, only judgement; a bonus
 * that handed over capital would let a player buy a book instead of reading
 * it. Measured against the real targets, a $25 top-up claimed eight times
 * would have won 29% of all 625 books outright — three of them on Impossible —
 * without a single good decision. So the shop sells help *playing*: a sharper
 * read on one applicant, an early sight of the week's withdrawals, one look
 * before you leap, and cash that is matched by the liability that came with it.
 *
 * The one that moves money moves it on *both* sides of the balance sheet: a
 * correspondent's deposit is cash you can lend today and a liability you owe
 * back, so it buys liquidity — the thing this game is actually short of —
 * without buying the score.
 */
import { store, render } from '../store.js';
import { createBonusShop } from '../bonusshop/shell.js';
import * as S from '../sim.js';
import { whole } from './kit.js';

const round2 = (n) => Math.round(n * 100) / 100;

const CORRESPONDENT = 400;

const midRunOnly = () => (store.run && store.run.phase !== 'gameover'
  ? { ok: true }
  : { ok: false, why: 'Only useful while a book is open — start one first.' });

const BONUSES = [
  {
    id: 'sleeponit',
    icon: '⏳',
    title: 'Sleep On It',
    describe: () => 'Send whoever is at the desk to the back of today’s queue, and see the rest first.',
    available: () => {
      if (!store.run || store.run.phase !== 'desk') {
        return { ok: false, why: 'Only at the desk, with a file in front of you.' };
      }
      const app = S.currentFile(store.run);
      if (!app) return { ok: false, why: 'Nobody is at the desk.' };
      if (app.deferred) return { ok: false, why: 'You have already put this one off once.' };
      if (S.filesLeft(store.run) <= 1) return { ok: false, why: 'Nobody is waiting behind them.' };
      return { ok: true };
    },
    // The one place the core loop bends: for one file, you get to look first.
    apply: () => { S.deferFile(store.run); },
  },
  {
    id: 'correspondent',
    icon: '🏦',
    title: 'A Correspondent’s Deposit',
    describe: () =>
      `${whole(CORRESPONDENT)} placed with you by another bank — cash to lend today, ` +
      `and ${whole(CORRESPONDENT)} more that can be asked for back.`,
    available: midRunOnly,
    // Both sides of the sheet, so capital is untouched. This buys liquidity,
    // never score — and it costs you the interest and the extra call risk.
    apply: () => {
      const r = store.run;
      r.cash = round2(r.cash + CORRESPONDENT);
      r.deposits = round2(r.deposits + CORRESPONDENT);
    },
  },
  {
    id: 'opinion',
    icon: '🔍',
    title: 'A Second Opinion',
    describe: () => {
      const app = store.run ? S.currentFile(store.run) : null;
      return app
        ? `Ask around about ${app.name.split(',')[0]} before you answer.`
        : 'Ask around about whoever is at the desk before you answer.';
    },
    available: () => {
      if (!store.run || store.run.phase !== 'desk') {
        return { ok: false, why: 'Only at the desk, with a file in front of you.' };
      }
      const app = S.currentFile(store.run);
      if (!app) return { ok: false, why: 'Nobody is at the desk.' };
      if (app.extraReading != null) return { ok: false, why: 'You have already asked about this one.' };
      return { ok: true };
    },
    apply: () => { S.secondOpinion(store.run, S.currentFile(store.run)); },
  },
  {
    id: 'clearinghouse',
    icon: '📅',
    title: 'Word From The Clearing House',
    describe: () => 'Find out exactly what the town will withdraw this week — before you lend it.',
    available: () => {
      if (!store.run || !['morning', 'desk'].includes(store.run.phase)) {
        return { ok: false, why: 'Only before the week is settled.' };
      }
      if (store.run.revealed?.week === store.run.week) {
        return { ok: false, why: 'You already know what this week holds.' };
      }
      return { ok: true };
    },
    apply: () => {
      const r = store.run;
      const { flow, fright } = S.projectedFlow(r);
      r.revealed = { week: r.week, flow, fright };
    },
  },
];

export const { screens, actions } = createBonusShop({
  store,
  render,
  bonuses: BONUSES,
  storageKey: 'the-ledger-bonusshop-v1',
});
