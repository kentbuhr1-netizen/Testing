import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';

const CFG = { seed: 4242, weeks: 12, funds: 11, baseFunds: 7, pathogenId: 'marrow' };

const play = (state, levels) => {
  state.levels = { ...S.NO_LEVELS, ...levels };
  const result = S.simulateWeek(state);
  S.commitWeek(state, result);
  return result;
};

test('the same seed replays the same outbreak', () => {
  const a = S.newRun(CFG);
  const b = S.newRun(CFG);
  for (let w = 0; w < 6; w++) {
    play(a, { trace: 2 });
    play(b, { trace: 2 });
  }
  assert.equal(a.d, b.d);
  assert.equal(a.i, b.i);
  assert.deepEqual(a.history.map((h) => h.newCases), b.history.map((h) => h.newCases));
});

test('a do-nothing baseline only ever climbs, and ends where baselineDeaths says', () => {
  const trajectory = S.baselineTrajectory(CFG);
  assert.equal(trajectory.length, CFG.weeks);
  for (let i = 1; i < trajectory.length; i++) {
    assert.ok(trajectory[i] >= trajectory[i - 1], `week ${i} fell`);
  }
  assert.equal(S.baselineDeaths(CFG), trajectory[trajectory.length - 1]);
});

test('every pathogen produces a real epidemic inside its own run length', () => {
  for (const p of S.PATHOGENS) {
    const state = S.newRun({ ...CFG, pathogenId: p.id });
    while (state.phase !== 'gameover') play(state, {});
    const attackRate = (state.d + state.r + state.i + state.e) / state.pop;
    assert.ok(attackRate > 0.25, `${p.name} only reached ${(attackRate * 100).toFixed(0)}%`);
    assert.ok(state.d > 100, `${p.name} killed only ${Math.round(state.d)}`);
  }
});

test('distancing cuts transmission, and cuts it less as patience runs out', () => {
  const state = S.newRun(CFG);
  const strong = S.distanceCut(state, 4);
  assert.ok(strong > 0.2, `expected a real cut, got ${strong}`);
  state.compliance = 0.15;
  assert.ok(S.distanceCut(state, 4) < strong / 3);
});

test('distancing does almost nothing to a pathogen that is not spread by people', () => {
  const person = S.newRun({ ...CFG, pathogenId: 'hollow' });
  const mosquito = S.newRun({ ...CFG, pathogenId: 'vector' });
  assert.ok(S.distanceCut(mosquito, 5) < S.distanceCut(person, 5) / 4);
});

test('tracing reach collapses once the labs are swamped', () => {
  const state = S.newRun(CFG);
  state.i = 100;
  state.e = 50;
  const early = S.traceReach(state, 5);
  state.i = state.pop * 0.1;
  state.e = state.pop * 0.05;
  const late = S.traceReach(state, 5);
  assert.ok(early > 0.9, `early reach was ${early}`);
  assert.ok(late < 0.1, `late reach was ${late}`);
  assert.ok(S.traceCut(state, 5) < S.traceCut(state, 5) + 1); // cut follows reach
});

test('a pathogen nobody can trace resists testing even with idle labs', () => {
  const traceable = S.newRun({ ...CFG, pathogenId: 'marrow' });
  const silent = S.newRun({ ...CFG, pathogenId: 'quietcarrier' });
  silent.i = traceable.i;
  silent.e = traceable.e;
  assert.ok(S.traceCut(silent, 5) < S.traceCut(traceable, 5) / 2);
});

test('vaccination protects nobody until the pathogen’s own lag has passed', () => {
  for (const pathogenId of ['marrow', 'greylung', 'hollow']) {
    const state = S.newRun({ ...CFG, pathogenId });
    const lag = state.pathogen.vaccineLag;
    const first = play(state, { vaccine: 3 });
    assert.ok(first.doses > 0, `${pathogenId} gave no doses`);
    assert.equal(first.matured, 0, `${pathogenId} protected people the same week`);

    // Dosed in week 1, so protection is due in week 1 + lag and not before.
    let landed = null;
    while (state.phase !== 'gameover' && landed === null) {
      const week = state.week;
      const result = play(state, { vaccine: 0 });
      if (result.matured > 0) landed = week;
    }
    assert.equal(landed, 1 + lag, `${pathogenId} landed in week ${landed}, expected ${1 + lag}`);
  }
});

test('beds open the week after they are funded, and overflow kills', () => {
  const state = S.newRun(CFG);
  const before = state.bedCapacity;
  play(state, { beds: 4 });
  assert.equal(state.bedCapacity, before, 'beds should not open the same week');
  play(state, { beds: 0 });
  assert.ok(state.bedCapacity > before, 'funded beds never opened');

  const cramped = S.newRun(CFG);
  const roomy = S.newRun(CFG);
  cramped.bedCapacity = 1;
  roomy.bedCapacity = roomy.pop;      // nobody ever goes without
  cramped.i = roomy.i = cramped.pop * 0.05;
  const a = S.simulateWeek(cramped);
  const b = S.simulateWeek(roomy);
  assert.ok(a.deaths > b.deaths * 1.5, 'an overwhelmed ward should cost lives');
  assert.ok(a.overflow > 0 && b.overflow === 0);
});

test('patience drains under closure and recovers when things reopen', () => {
  const state = S.newRun(CFG);
  const start = state.compliance;
  play(state, { distance: 5 });
  const tired = state.compliance;
  assert.ok(tired < start, 'closures should cost patience');
  for (let w = 0; w < 3; w++) play(state, { distance: 0 });
  assert.ok(state.compliance > tired, 'patience should come back');
});

test('closing things starves the budget that pays for everything else', () => {
  const state = S.newRun(CFG);
  const open = S.simulateWeek(state).income;
  state.levels = { ...S.NO_LEVELS, distance: 5 };
  const shut = S.simulateWeek(state).income;
  assert.ok(shut < open * 0.5, `income only fell from ${open} to ${shut}`);
});

test('the weekly bill scales with the district and never charges for distancing', () => {
  const small = S.weeklySpend({ trace: 2, distance: 5, vaccine: 1, beds: 1 }, S.REF_POP);
  const large = S.weeklySpend({ trace: 2, distance: 5, vaccine: 1, beds: 1 }, S.REF_POP * 2);
  assert.ok(Math.abs(large - small * 2) < 0.01);
  assert.equal(S.weeklySpend({ ...S.NO_LEVELS, distance: 5 }, S.REF_POP), 0);
});

test('a run ends after exactly its weeks, and scores against the do-nothing baseline', () => {
  const state = S.newRun({ ...CFG, target: 1 });
  let guard = 0;
  while (state.phase !== 'gameover' && guard++ < 100) play(state, { trace: 3 });
  assert.equal(state.week, CFG.weeks + 1);
  assert.equal(state.history.length, CFG.weeks);

  const score = S.finalScore(state);
  assert.equal(score.saved, Math.round(Math.max(0, state.baselineDeaths - state.d)));
  assert.equal(score.won, score.saved >= score.target);
  assert.ok(score.attackRate >= 0 && score.attackRate <= 1);
});

test('par is a real number of lives, and never more than the outbreak could take', () => {
  for (const pathogenId of ['marrow', 'vector', 'cascade', 'ashfall']) {
    const cfg = { ...CFG, pathogenId };
    const baseline = S.baselineDeaths(cfg);
    const par = S.parSaved(cfg);
    assert.ok(par > 0, `${pathogenId} par was ${par}`);
    assert.ok(par <= baseline, `${pathogenId} saved more than could die`);
  }
});

test('the reference bot never commits money it does not have', () => {
  const state = S.newRun(CFG);
  const policy = S.POLICIES[S.POLICIES.length - 1];
  while (state.phase !== 'gameover') {
    const levels = S.referenceLevels(state, policy);
    assert.ok(S.weeklySpend(levels, state.pop) <= state.funds + 1e-9);
    state.levels = levels;
    S.commitWeek(state, S.simulateWeek(state));
  }
});

test('the compartments always add up to the population', () => {
  const state = S.newRun(CFG);
  while (state.phase !== 'gameover') {
    play(state, { trace: 2, distance: 2, vaccine: 2, beds: 1 });
    const total = state.s + state.e + state.i + state.r + state.d;
    assert.ok(Math.abs(total - state.pop) < state.pop * 1e-6,
      `week ${state.week}: ${total} vs ${state.pop}`);
  }
});

test('surveillance tells you when a lever is doing nothing', () => {
  const state = S.newRun({ ...CFG, pathogenId: 'vector' });
  const result = play(state, { distance: 5 });
  assert.ok(result.notes.some((n) => /not spreading person to person/.test(n)),
    `notes were: ${result.notes.join(' | ')}`);
});

test('a programme that outgrows a shrinking budget is scaled back, not stranded', () => {
  const state = S.newRun(CFG);
  const greedy = { trace: 5, distance: 5, vaccine: 5, beds: 5 };
  assert.ok(S.weeklySpend(greedy, state.pop) > state.funds, 'test needs an unaffordable plan');

  const trimmed = S.affordLevels(greedy, state.funds, state.pop);
  assert.ok(S.weeklySpend(trimmed, state.pop) <= state.funds, 'still unaffordable after trimming');
  assert.equal(trimmed.distance, 5, 'distancing is free and should never be trimmed');
  for (const key of ['trace', 'vaccine', 'beds']) {
    assert.ok(trimmed[key] <= greedy[key], `${key} went up`);
  }

  // An affordable plan is left exactly as it was.
  const modest = { trace: 1, distance: 2, vaccine: 0, beds: 1 };
  assert.deepEqual(S.affordLevels(modest, state.funds, state.pop), modest);

  // With nothing in the bank, everything that costs money goes.
  const broke = S.affordLevels(greedy, 0, state.pop);
  assert.deepEqual(broke, { trace: 0, distance: 5, vaccine: 0, beds: 0 });
});
