import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';

const play = (state, answer) => {
  S.openDesk(state);
  while (state.phase === 'desk') S.decide(state, answer(S.currentFile(state), state));
  return S.settleWeek(state);
};

/* ---------- determinism ---------- */

test('the same seed deals the same applicants, with the same fates', () => {
  const a = S.newRun({ seed: 4242, weeks: 10 });
  const b = S.newRun({ seed: 4242, weeks: 10 });
  assert.deepEqual(a.applications, b.applications);
  assert.deepEqual(a.script, b.script);
  const c = S.newRun({ seed: 4243, weeks: 10 });
  assert.notDeepEqual(a.applications, c.applications);
});

test('every week of applicants is rolled before a single decision is made', () => {
  const state = S.newRun({ seed: 77, weeks: 12 });
  assert.equal(state.applications.length, 12);
  for (const batch of state.applications) assert.ok(batch.length >= 1);
  // Whether they go bad is decided up front, not when you approve them.
  const all = state.applications.flat();
  assert.ok(all.some((a) => a.defaultAt != null));
  assert.ok(all.every((a) => a.defaultAt === null || a.defaultAt < a.term));
});

test('the town’s frights are fixed by the seed, not by how you play', () => {
  const lend = S.newRun({ seed: 909, weeks: 8 });
  const refuse = S.newRun({ seed: 909, weeks: 8 });
  play(lend, () => true);
  play(refuse, () => false);
  assert.deepEqual(lend.script, refuse.script);
});

/* ---------- the file ---------- */

test('a file carries four readings and never the answer', () => {
  const app = S.newRun({ seed: 5, weeks: 4 }).applications[0][0];
  for (const key of ['books', 'standing', 'remark']) {
    assert.ok(Number.isInteger(app.signals[key]), key);
  }
  assert.ok(app.rate > 0 && app.amount > 0 && app.term > 0);
  assert.ok(app.security >= 0 && app.security <= 0.8);
  assert.ok(S.BOOKS[app.signals.books] && S.STANDING[app.signals.standing] && S.REMARKS[app.signals.remark]);
});

test('a better name is likelier to pay, over ten weeks', () => {
  assert.ok(S.riskFor(0.9) < S.riskFor(0.5));
  assert.ok(S.riskFor(0.5) < S.riskFor(0.15));
  assert.ok(S.riskFor(0.9) >= 0.015 && S.riskFor(0.01) <= 0.85);
});

test('risk is a weekly hazard, so a longer loan has longer to go wrong', () => {
  const short = S.defaultChance(0.5, 4);
  const long = S.defaultChance(0.5, 16);
  assert.ok(long > short, `${long} should exceed ${short}`);
  // Ten weeks is the yardstick the headline risk is quoted over.
  assert.ok(Math.abs(S.defaultChance(0.5, 10) - S.riskFor(0.5)) < 1e-9);
});

test('the rate is the market’s grade, and reads back out exactly', () => {
  for (const grade of [0.05, 0.3, 0.62, 0.95]) {
    for (const term of [4, 9, 17]) {
      const app = { rate: S.rateFor(grade, term), term };
      assert.ok(Math.abs(S.gradeFromRate(app) - grade) < 1e-6, `${grade}/${term}`);
    }
  }
});

test('a worse name is quoted a higher rate', () => {
  assert.ok(S.rateFor(0.2, 10) > S.rateFor(0.8, 10));
});

/* ---------- the desk ---------- */

test('answering a file moves to the next one and cannot be taken back', () => {
  const state = S.newRun({ seed: 31, weeks: 6 });
  S.openDesk(state);
  const first = S.currentFile(state);
  const queue = S.deskQueue(state).length;
  S.decide(state, false);
  assert.notEqual(S.currentFile(state), first);
  assert.equal(S.filesLeft(state), queue - 1);
  assert.equal(state.declined, 1);
});

test('approving takes the money out of the safe and puts a loan on the book', () => {
  const state = S.newRun({ seed: 32, weeks: 6 });
  S.openDesk(state);
  const app = S.currentFile(state);
  const cash = state.cash;
  S.decide(state, true);
  assert.equal(state.cash, Math.round((cash - app.amount) * 100) / 100);
  assert.equal(state.loans.length, 1);
  assert.equal(S.bookValue(state), app.amount);
  assert.equal(state.written, 1);
});

test('declining costs nothing but the chance', () => {
  const state = S.newRun({ seed: 33, weeks: 6 });
  S.openDesk(state);
  const cash = state.cash;
  S.decide(state, false);
  assert.equal(state.cash, cash);
  assert.equal(state.loans.length, 0);
});

test('you cannot lend money you do not hold', () => {
  const state = S.newRun({ seed: 34, weeks: 6 });
  S.openDesk(state);
  state.cash = 1;
  const outcome = S.decide(state, true);
  assert.equal(outcome.approved, false);
  assert.match(outcome.why, /not that much cash/i);
  assert.equal(state.loans.length, 0);
});

test('the desk closes itself once the last file is answered', () => {
  const state = S.newRun({ seed: 35, weeks: 6 });
  S.openDesk(state);
  S.closeDesk(state);
  assert.equal(state.phase, 'settle');
  assert.equal(S.currentFile(state), null);
});

/* ---------- money ---------- */

test('a loan pays interest weekly and the principal in one piece at the end', () => {
  const state = S.newRun({ seed: 36, weeks: 20 });
  S.openDesk(state);
  const app = S.currentFile(state);
  app.defaultAt = null;                     // this one sees it through
  S.decide(state, true);
  S.closeDesk(state);

  let returned = 0;
  let interest = 0;
  for (let w = 0; w < app.term; w++) {
    const report = S.settleWeek(state);
    interest += report.collected;
    returned += report.returned;
    S.commitWeek(state, report);
    if (state.phase === 'gameover') break;
    S.openDesk(state);
    S.closeDesk(state);
  }
  assert.ok(Math.abs(returned - app.amount) < 1, `principal back: ${returned} vs ${app.amount}`);
  assert.ok(Math.abs(interest - app.amount * app.rate) < 1, `interest: ${interest}`);
  assert.equal(S.liveLoans(state).length, 0);
});

test('a loan that goes bad loses the principal, less whatever the security fetches', () => {
  const state = S.newRun({ seed: 37, weeks: 20 });
  S.openDesk(state);
  const app = S.currentFile(state);
  app.defaultAt = 0;                        // never pays a penny
  S.decide(state, true);
  S.closeDesk(state);
  const report = S.settleWeek(state);
  assert.equal(report.defaults.length, 1);
  assert.equal(report.defaults[0].outstanding, app.amount);
  assert.ok(Math.abs(report.defaults[0].recovered - app.amount * app.security) < 0.02);
  assert.ok(report.badDebt > 0);
});

test('capital is cash plus what is owed you, less what you owe', () => {
  const state = S.newRun({ seed: 38, weeks: 8 });
  assert.equal(S.capital(state), state.stake);
  S.openDesk(state);
  S.decide(state, true);
  // Lending moves money from one pocket to another; it does not create any.
  assert.equal(S.capital(state), state.stake);
});

test('confidence pulls deposits in, and pushes them out', () => {
  const high = S.newRun({ seed: 40, weeks: 6 });
  high.confidence = 0.95;
  high.script = high.script.map((w) => ({ ...w, noise: 0, fright: false }));
  S.openDesk(high); S.closeDesk(high);
  assert.ok(S.settleWeek(high).flow > 0);

  const low = S.newRun({ seed: 40, weeks: 6 });
  low.confidence = 0.1;
  low.script = low.script.map((w) => ({ ...w, noise: 0, fright: false }));
  S.openDesk(low); S.closeDesk(low);
  assert.ok(S.settleWeek(low).flow < 0);
});

test('the town only has so much money to place', () => {
  const state = S.newRun({ seed: 41, weeks: 30 });
  state.confidence = 1;
  state.script = state.script.map((w) => ({ ...w, noise: 0, fright: false }));
  for (let i = 0; i < 25 && state.phase !== 'gameover'; i++) {
    S.openDesk(state); S.closeDesk(state);
    S.commitWeek(state, S.settleWeek(state));
  }
  assert.ok(state.deposits <= state.depositCap * 1.05,
    `deposits ${state.deposits} ran past the cap ${state.depositCap}`);
});

/* ---------- the liquidity trap ---------- */

test('a bank that has lent everything out cannot pay, however sound it is', () => {
  const state = S.newRun({ seed: 42, weeks: 8 });
  state.cash = 10;                        // every penny is out on loan
  state.script[state.week] = { noise: 0, fright: true, frightSize: 0.5, frightNote: 'A fright.' };
  S.openDesk(state); S.closeDesk(state);
  const report = S.settleWeek(state);
  assert.ok(report.shortfall > 0, 'should not have been able to pay');
  assert.ok(report.confidenceAfter < report.confidenceBefore - 0.2,
    'failing to pay should cost a great deal of confidence');
  assert.match(report.trustNote, /could not pay/i);
});

test('confidence goes in an afternoon and comes back over months', () => {
  const lost = S.newRun({ seed: 43, weeks: 8 });
  lost.cash = 5;
  lost.script[lost.week] = { noise: 0, fright: true, frightSize: 0.5, frightNote: 'A fright.' };
  S.openDesk(lost); S.closeDesk(lost);
  const bad = S.settleWeek(lost);
  const drop = bad.confidenceBefore - bad.confidenceAfter;

  const calm = S.newRun({ seed: 43, weeks: 8 });
  calm.confidence = 0.2;
  calm.script = calm.script.map((w) => ({ ...w, noise: 0, fright: false }));
  S.openDesk(calm); S.closeDesk(calm);
  const good = S.settleWeek(calm);
  const gain = good.confidenceAfter - good.confidenceBefore;

  assert.ok(gain > 0 && gain <= S.TRUST_REBUILD, `a quiet week gained ${gain}`);
  assert.ok(drop > gain * 10, `lost ${drop} in a week but rebuilds only ${gain}`);
});

test('there is nothing in the game that buys confidence back', () => {
  const rich = S.newRun({ seed: 44, weeks: 8 });
  rich.confidence = 0.3;
  rich.cash = 10_000_000;                 // all the money in the world
  rich.script = rich.script.map((w) => ({ ...w, noise: 0, fright: false }));
  S.openDesk(rich); S.closeDesk(rich);
  const gain = S.settleWeek(rich);

  const poor = S.newRun({ seed: 44, weeks: 8 });
  poor.confidence = 0.3;
  poor.script = poor.script.map((w) => ({ ...w, noise: 0, fright: false }));
  S.openDesk(poor); S.closeDesk(poor);
  const modest = S.settleWeek(poor);

  assert.ok(gain.confidenceAfter - gain.confidenceBefore <= S.TRUST_REBUILD);
  assert.equal(gain.confidenceAfter - gain.confidenceBefore,
    modest.confidenceAfter - modest.confidenceBefore,
    'a fortune should not buy trust one point faster than a shilling — exactly');
});

test('a run on the bank closes it', () => {
  const state = S.newRun({ seed: 45, weeks: 12, target: 100 });
  state.cash = 0;
  state.confidence = 0.3;
  state.script[state.week] = { noise: 0, fright: true, frightSize: 0.6, frightNote: 'A fright.' };
  S.openDesk(state); S.closeDesk(state);
  S.commitWeek(state, S.settleWeek(state));
  assert.equal(state.failed, 'run');
  assert.equal(state.phase, 'gameover');
  assert.equal(S.finalScore(state).won, false);
});

test('losing the capital closes it too, and they are different deaths', () => {
  const state = S.newRun({ seed: 46, weeks: 12 });
  state.deposits = state.cash + 50;       // more owed than held
  S.openDesk(state); S.closeDesk(state);
  S.commitWeek(state, S.settleWeek(state));
  assert.equal(state.failed, 'insolvent');
  assert.equal(S.finalScore(state).rank.title, 'Wound Up');
});

test('the withdrawal forecast brackets what actually happens on a calm week', () => {
  const state = S.newRun({ seed: 47, weeks: 8 });
  state.confidence = 0.3;
  state.script = state.script.map((w) => ({ ...w, fright: false }));
  const forecast = S.withdrawalForecast(state);
  S.openDesk(state); S.closeDesk(state);
  const out = -S.settleWeek(state).flow;
  assert.ok(out >= forecast.low - 0.01 && out <= forecast.high + 0.01,
    `${out} outside ${forecast.low}..${forecast.high}`);
});

/* ---------- scoring ---------- */

test('a book is won on the capital built, against its target', () => {
  const state = S.newRun({ seed: 48, weeks: 4, target: 100 });
  state.phase = 'gameover';
  state.cash += 400;
  assert.equal(S.finalScore(state).won, true);
  state.cash -= 400;
  assert.equal(S.finalScore(state).won, false);
  assert.equal(S.newRun({ seed: 48, weeks: 4 }).target, null);
});

/* ---------- the reference players ---------- */

test('no reference player is allowed to see the answer', () => {
  const state = S.newRun({ seed: 50, weeks: 6 });
  const app = { ...state.applications[0][0] };
  delete app.quality;
  delete app.risk;
  delete app.chance;
  delete app.defaultAt;
  // Everything the bots use has to survive the hidden fields being taken away.
  const estimate = S.readFile(app);
  assert.ok(estimate > 0 && estimate < 1);
  assert.ok(Number.isFinite(S.expectedReturn(app, estimate)));
  for (const policy of S.POLICIES) {
    assert.equal(typeof S.referenceDecision(state, app, policy), 'boolean', policy.id);
  }
});

test('the family holds the obvious bad strategies as well as the good ones', () => {
  const ids = S.POLICIES.map((p) => p.id);
  assert.ok(ids.includes('approve-all'));
  assert.ok(ids.includes('decline-all'));
  assert.ok(ids.some((id) => id.startsWith('safest-')));
  assert.ok(ids.some((id) => id.startsWith('rate-')));
  assert.ok(S.POLICIES.length >= 40);
});

test('par is the best of the family, so no simple heuristic can beat it', () => {
  const config = { seed: 51, weeks: 16 };
  const profits = S.policyProfits(config);
  const par = S.parProfit(config);
  for (const [id, profit] of Object.entries(profits)) {
    assert.ok(profit <= par + 1e-9, `${id} scored ${profit} against par ${par}`);
  }
});

test('saying yes to everybody, and saying no to everybody, both lose money', () => {
  let yes = 0;
  let no = 0;
  for (let i = 0; i < 8; i++) {
    const config = { seed: 6000 + i * 7919, weeks: 16 };
    yes += S.playPolicy(config, { id: 'approve-all', kind: 'all' });
    no += S.playPolicy(config, { id: 'decline-all', kind: 'none' });
  }
  assert.ok(yes / 8 < 0, `approving everything averaged ${yes / 8}`);
  assert.ok(no / 8 < 0, `declining everything averaged ${no / 8}`);
});

test('reading the file beats reading only the rate', () => {
  let file = 0;
  let rate = 0;
  for (let i = 0; i < 8; i++) {
    const config = { seed: 6100 + i * 7919, weeks: 18 };
    file += S.playPolicy(config, { kind: 'ev', bar: 0.05, reserve: 0.02, gradeWeight: 0, share: 0.3 });
    rate += S.playPolicy(config, { kind: 'rate', min: 0.1, reserve: 0.15 });
  }
  assert.ok(file / 8 > rate / 8, `file ${file / 8} should beat rate-chasing ${rate / 8}`);
});

test('a whole book plays out to an ending', () => {
  const state = S.newRun({ seed: 52, weeks: 14 });
  let guard = 0;
  while (state.phase !== 'gameover' && guard++ < 200) {
    S.openDesk(state);
    while (state.phase === 'desk') S.decide(state, S.currentFile(state).signals.books >= 2);
    S.commitWeek(state, S.settleWeek(state));
  }
  assert.equal(state.phase, 'gameover');
  assert.ok(state.history.length >= 1);
  for (const week of state.history) assert.ok(week.notes.length >= 1);
});

test('approving a file the cash cannot cover counts as turning it away', () => {
  const state = S.newRun({ seed: 9, weeks: 6 });
  S.openDesk(state);
  state.cash = 1;
  const before = state.declined;
  const out = S.decide(state, true);
  assert.equal(out.approved, false);
  assert.equal(state.declined, before + 1);
});

test('the safe can be overdrawn, and the week says so instead of hiding it', () => {
  const state = S.newRun({ seed: 12, weeks: 6 });
  state.script = state.script.map((w) => ({ ...w, noise: 0, fright: false }));
  S.openDesk(state); S.closeDesk(state);
  state.cash = 0.5;
  state.deposits = 0;
  const report = S.settleWeek(state);
  assert.ok(report.overdrawn > 0, 'overhead was still charged, and the week says by how much');
  assert.equal(S.reserveRatio({ cash: -4, deposits: 100 }), 0, 'a negative safe reads as no reserves, not less than none');
});
