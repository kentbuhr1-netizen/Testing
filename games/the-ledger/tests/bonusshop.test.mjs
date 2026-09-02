import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';
import { createBonusCore } from '../js/bonusshop/core.js';

/**
 * The shop's shell is the shared module and has its own tests. What is worth
 * testing here is the part that is this game's: that the two information
 * bonuses tell the truth, that they cannot be farmed for a better answer, and
 * that the money one cannot be used to buy a target.
 */

const openDesk = (state) => { S.openDesk(state); return S.currentFile(state); };

/* ---------- the projection the clearing house sells ---------- */

test('the projected flow is exactly what settling the week does', () => {
  for (const seed of [11, 222, 3333, 44444]) {
    const state = S.newRun({ seed, weeks: 10 });
    S.openDesk(state);
    S.closeDesk(state);
    const projected = S.projectedFlow(state);
    const report = S.settleWeek(state);
    assert.equal(report.flow, projected.flow, `seed ${seed}`);
    assert.equal(report.fright, projected.fright, `seed ${seed} fright`);
  }
});

test('the projection sees a fright coming before the money goes out', () => {
  const state = S.newRun({ seed: 5, weeks: 8 });
  state.script[state.week] = { noise: 0, fright: true, frightSize: 0.3, frightNote: 'A fright.' };
  const projected = S.projectedFlow(state);
  assert.equal(projected.fright, 'A fright.');
  assert.ok(projected.flow < 0, 'a fright should take money out');
  // and it is knowable while you can still decide not to lend
  assert.equal(state.phase, 'morning');
});

test('lending does not change what the town is about to withdraw', () => {
  const state = S.newRun({ seed: 6, weeks: 8 });
  const before = S.projectedFlow(state);
  S.openDesk(state);
  S.decide(state, true);
  assert.deepEqual(S.projectedFlow(state), before,
    'the withdrawal is fixed before you lend — that is the whole trap');
});

/* ---------- the second opinion ---------- */

test('a second opinion is another noisy reading, not the answer', () => {
  const state = S.newRun({ seed: 7, weeks: 12 });
  let seen = 0;
  let wrong = 0;
  for (const batch of state.applications) {
    for (const app of batch) {
      const band = S.secondOpinion(state, app);
      assert.ok(band >= 0 && band < S.OPINIONS.length);
      // A perfect oracle would never rate a bad name highly. This one does.
      if (app.quality < 0.35 && band >= 3) wrong += 1;
      seen += 1;
    }
  }
  assert.ok(seen > 40);
  assert.ok(wrong > 0, 'a reading that is never wrong is not a reading');
});

test('asking twice, or reloading, cannot reroll a second opinion', () => {
  const state = S.newRun({ seed: 8, weeks: 8 });
  const app = openDesk(state);
  const first = S.secondOpinion(state, app);
  assert.equal(S.secondOpinion(state, app), first);

  // Survives the save/restore round trip the game actually does.
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(S.secondOpinion(restored, S.currentFile(restored)), first);
});

test('the same seed gives the same second opinion', () => {
  const a = S.newRun({ seed: 99, weeks: 8 });
  const b = S.newRun({ seed: 99, weeks: 8 });
  assert.equal(S.secondOpinion(a, openDesk(a)), S.secondOpinion(b, openDesk(b)));
});

test('a second opinion tracks quality on average, or it would be worthless', () => {
  const state = S.newRun({ seed: 10, weeks: 25 });
  const apps = state.applications.flat();
  for (const app of apps) S.secondOpinion(state, app);
  const good = apps.filter((a) => a.quality >= 0.65);
  const bad = apps.filter((a) => a.quality <= 0.35);
  const mean = (list) => list.reduce((n, a) => n + a.extraReading, 0) / list.length;
  assert.ok(mean(good) > mean(bad) + 1,
    `good names averaged ${mean(good).toFixed(2)} against ${mean(bad).toFixed(2)}`);
});

test('secondOpinion on nobody is not an error', () => {
  assert.equal(S.secondOpinion(S.newRun({ seed: 12, weeks: 4 }), null), null);
});

/* ---------- what the money bonuses may and may not do ---------- */

test('a correspondent’s deposit buys liquidity and no score at all', () => {
  const state = S.newRun({ seed: 13, weeks: 10 });
  const capitalBefore = S.capital(state);
  const cashBefore = state.cash;

  state.cash = Math.round((state.cash + 400) * 100) / 100;
  state.deposits = Math.round((state.deposits + 400) * 100) / 100;

  assert.equal(state.cash, cashBefore + 400, 'there is more to lend');
  assert.equal(S.capital(state), capitalBefore, 'and not a penny more capital');
});

test('a correspondent’s deposit costs interest and can be asked for back', () => {
  const plain = S.newRun({ seed: 14, weeks: 10 });
  const owing = S.newRun({ seed: 14, weeks: 10 });
  owing.cash += 400;
  owing.deposits += 400;

  for (const state of [plain, owing]) { S.openDesk(state); S.closeDesk(state); }
  const a = S.settleWeek(plain);
  const b = S.settleWeek(owing);
  assert.ok(b.interest > a.interest, 'more deposits must cost more interest');
  assert.ok(Math.abs(b.flow) !== Math.abs(a.flow), 'and move more money when the town shifts');
});

/* ---------- sleeping on it: the one place the core loop bends ---------- */

test('sleeping on it sends the applicant to the back of today’s queue', () => {
  const state = S.newRun({ seed: 20, weeks: 8 });
  const first = openDesk(state);
  const queue = S.deskQueue(state);
  const behind = queue[1];
  const length = queue.length;

  assert.equal(S.deferFile(state), true);
  assert.equal(S.currentFile(state), behind, 'the next one steps forward');
  assert.equal(S.deskQueue(state).at(-1), first, 'and the first goes to the back');
  assert.equal(S.deskQueue(state).length, length, 'nobody is lost');
});

test('a deferred applicant still has to be answered before the week settles', () => {
  const state = S.newRun({ seed: 21, weeks: 8 });
  const first = openDesk(state);
  S.deferFile(state);
  S.closeDesk(state);
  assert.equal(state.phase, 'settle');
  assert.equal(state.declined, S.deskQueue(state).length, 'every file was answered, deferred or not');
  assert.ok(S.deskQueue(state).includes(first));
});

test('you cannot put the same one off twice, or defer the last in the queue', () => {
  const state = S.newRun({ seed: 22, weeks: 8 });
  openDesk(state);
  assert.equal(S.deferFile(state), true);
  // it is now at the back; walk to it and try again
  while (S.filesLeft(state) > 1) S.decide(state, false);
  assert.equal(S.currentFile(state).deferred, true);
  assert.equal(S.deferFile(state), false, 'already put off once');
});

test('deferring is refused when there is nobody behind them', () => {
  const state = S.newRun({ seed: 23, weeks: 8 });
  S.openDesk(state);
  while (S.filesLeft(state) > 1) S.decide(state, false);
  assert.equal(S.filesLeft(state), 1);
  assert.equal(S.deferFile(state), false);
});

test('deferring off the desk is refused', () => {
  const state = S.newRun({ seed: 24, weeks: 8 });
  assert.equal(state.phase, 'morning');
  assert.equal(S.deferFile(state), false);
});

/* ---------- nothing in the shop may buy the score ---------- */

test('no bonus this game sells moves capital', () => {
  const state = S.newRun({ seed: 25, weeks: 10 });
  const before = S.capital(state);

  // Every effect the four bonuses have, applied at once.
  state.cash = Math.round((state.cash + 400) * 100) / 100;
  state.deposits = Math.round((state.deposits + 400) * 100) / 100;
  S.openDesk(state);
  S.secondOpinion(state, S.currentFile(state));
  S.deferFile(state);
  state.revealed = { week: state.week, ...S.projectedFlow(state) };

  assert.equal(S.capital(state), before,
    'the shop sells help playing, never a shortcut to the target');
});

/* ---------- the cooldown contract this game relies on ---------- */

test('a claimed bonus goes on cooldown and its neighbours do not', () => {
  let now = 1_000_000;
  const claimed = [];
  const store = new Map();
  const core = createBonusCore({
    storageKey: 'the-ledger-bonusshop-v1',
    cooldownMs: 60_000,
    now: () => now,
    storage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    bonuses: [
      { id: 'sleeponit', icon: '⏳', title: 'Sleep On It', describe: () => '', available: () => ({ ok: true }), apply: () => claimed.push('sleeponit') },
      { id: 'opinion', icon: '🔍', title: 'Opinion', describe: () => '', available: () => ({ ok: true }), apply: () => claimed.push('opinion') },
    ],
  });

  assert.equal(core.status('sleeponit').state, 'ready');
  assert.equal(core.claim('sleeponit').claimed, true);
  assert.equal(core.status('sleeponit').state, 'cooldown');
  assert.equal(core.status('opinion').state, 'ready', 'cooldowns are per bonus');

  assert.equal(core.claim('sleeponit').claimed, false, 'and cannot be claimed through');
  now += 60_001;
  assert.equal(core.status('sleeponit').state, 'ready');
  assert.deepEqual(claimed, ['sleeponit']);
});

test('an unavailable bonus is never applied', () => {
  let applied = 0;
  const core = createBonusCore({
    storageKey: 'x',
    storage: { getItem: () => null, setItem: () => {} },
    bonuses: [{
      id: 'opinion', icon: '🔍', title: 'Opinion', describe: () => '',
      available: () => ({ ok: false, why: 'Nobody is at the desk.' }),
      apply: () => { applied += 1; },
    }],
  });
  assert.equal(core.status('opinion').state, 'unavailable');
  assert.equal(core.status('opinion').why, 'Nobody is at the desk.');
  assert.equal(core.claim('opinion').claimed, false);
  assert.equal(applied, 0);
});
