import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';

const CFG = { seed: 4242, shifts: 12, purse: 11, retainer: 2.4, alloyId: 'mild' };

const work = (state, levels, hands = 0) => {
  state.levels = { ...S.NO_LEVELS, ...levels };
  state.hands = hands;
  const result = S.simulateShift(state);
  S.commitShift(state, result);
  return result;
};

/** The average quality a bellows notch achieves on a state, at a given workload. */
const qualityAt = (state, notch, perTick = 20) =>
  S.heatCurve(state, notch, perTick)
    .reduce((sum, heat) => sum + S.workQuality(state.alloy, heat), 0) / S.TICKS_PER_SHIFT;

test('the same seed replays the same commission', () => {
  const a = S.newRun(CFG);
  const b = S.newRun(CFG);
  for (let i = 0; i < 6; i++) {
    work(a, { bellows: 5, crew: 3 }, 40);
    work(b, { bellows: 5, crew: 3 }, 40);
  }
  assert.equal(a.pieces, b.pieces);
  assert.equal(a.coin, b.coin);
  assert.deepEqual(a.history.map((h) => h.piecesShown), b.history.map((h) => h.piecesShown));
});

/**
 * The load-bearing rule of the whole game: heat is the one thing that cannot
 * be stockpiled. A shop that finished yesterday white-hot and one that
 * finished cold start the next morning at exactly the same dull glow.
 */
test('the fire is cold again every morning, however hot it was left', () => {
  const hot = S.newRun(CFG);
  const cold = S.newRun(CFG);
  work(hot, { bellows: 10 });
  work(cold, { bellows: 0 });
  assert.equal(hot.heat, S.START_HEAT);
  assert.equal(cold.heat, S.START_HEAT);
  assert.equal(S.heatCurve(hot, 4, 0)[0], S.heatCurve(cold, 4, 0)[0]);
});

test('no amount of money buys a hot forge at the start of a shift', () => {
  const rich = S.newRun(CFG);
  rich.coin = 10_000;
  const broke = S.newRun(CFG);
  broke.coin = 1;
  assert.deepEqual(S.heatCurve(rich, 6, 20), S.heatCurve(broke, 6, 20));
});

test('every alloy can be worked well by somebody who knows its heat', () => {
  for (const alloy of S.ALLOYS) {
    const state = S.newRun({ ...CFG, alloyId: alloy.id });
    const notch = S.bestBellows(state, 20);
    assert.ok(notch > 0 && notch <= S.LEVER_MAX.bellows, `${alloy.name}: notch ${notch}`);
    assert.ok(qualityAt(state, notch) > 0.5,
      `${alloy.name} tops out at ${qualityAt(state, notch).toFixed(2)} — no notch works it`);
  }
});

/**
 * How much a wrong notch costs is the character of the alloy, not a constant:
 * a wide window forgives one notch and a narrow one does not. What has to hold
 * everywhere is that guessing badly ruins the shift — otherwise the hidden
 * working heat is not a question worth asking.
 */
test('a metal that is fussy about its heat punishes a single notch', () => {
  for (const alloy of S.ALLOYS) {
    const state = S.newRun({ ...CFG, alloyId: alloy.id });
    if (state.alloy.window >= 0.2) continue;          // the forgiving ones forgive, by design
    const best = S.bestBellows(state, 20);
    const peak = qualityAt(state, best);
    const either = Math.max(
      best > 0 ? qualityAt(state, best - 1) : 0,
      best < S.LEVER_MAX.bellows ? qualityAt(state, best + 1) : 0,
    );
    assert.ok(either < peak * 0.92,
      `${alloy.name}: a notch off costs only ${((1 - either / peak) * 100).toFixed(1)}%`);
  }
});

test('being three notches out ruins the shift on any metal at all', () => {
  for (const alloy of S.ALLOYS) {
    const state = S.newRun({ ...CFG, alloyId: alloy.id });
    const best = S.bestBellows(state, 20);
    const peak = qualityAt(state, best);
    const far = Math.max(
      best >= 3 ? qualityAt(state, best - 3) : 0,
      best <= S.LEVER_MAX.bellows - 3 ? qualityAt(state, best + 3) : 0,
    );
    assert.ok(far < peak * 0.6, `${alloy.name}: three notches out still gets ${(far / peak * 100).toFixed(0)}%`);
  }
});

test('a forgiving metal really is more forgiving than a fussy one', () => {
  // The kindest notch either side — being out by one, at your luckiest.
  const cost = (id) => {
    const state = S.newRun({ ...CFG, alloyId: id });
    const best = S.bestBellows(state, 20);
    const either = Math.max(qualityAt(state, best - 1), qualityAt(state, best + 1));
    return 1 - either / qualityAt(state, best);
  };
  assert.ok(cost('meteoric') > cost('mild') * 2,
    'meteoric iron should punish a wrong notch far harder than mild steel');
});

test('the alloy never tells you what heat it wants', () => {
  // The two numbers the game turns on live on the rolled alloy and nowhere a
  // screen can reach them: no lever readout, note or score may quote either.
  const state = S.newRun(CFG);
  assert.ok(state.alloy.idealHeat > 0 && state.alloy.window > 0);
  const result = work(state, { bellows: 2, crew: 2 }, 20);
  const said = [...result.notes, JSON.stringify(S.finalScore(state))].join(' ');
  assert.ok(!said.includes(String(state.alloy.idealHeat)), 'the working heat leaked into the notes');
  assert.ok(!said.includes(String(state.alloy.window)), 'the window leaked into the notes');
});

test('striking drags the fire down, so a busy shop needs a hotter bellows', () => {
  const state = S.newRun(CFG);
  const quiet = S.heatCurve(state, 6, 0).at(-1);
  const busy = S.heatCurve(state, 6, 60).at(-1);
  assert.ok(busy < quiet, `busy ${busy} should sit under quiet ${quiet}`);
  assert.ok(S.bestBellows(state, 60) >= S.bestBellows(state, 0));
});

test('the fire climbs towards its notch and never past it', () => {
  const state = S.newRun(CFG);
  const curve = S.heatCurve(state, 7, 0);
  for (let i = 1; i < curve.length; i++) assert.ok(curve[i] >= curve[i - 1], `hour ${i} fell`);
  assert.ok(curve.at(-1) <= S.restingHeat(7) + 1e-9);
  assert.ok(curve[0] > S.START_HEAT, 'the fire should be climbing by the first hour');
});

test('an apprentice is worth less when the shop is tired', () => {
  const state = S.newRun(CFG);
  const fresh = S.crewSwings(state, 5);
  state.morale = 0.1;
  assert.ok(S.crewSwings(state, 5) < fresh * 0.6);
});

test('the pace buys swings with morale, and pays for them in scrap', () => {
  const easy = S.newRun(CFG);
  const hard = S.newRun(CFG);
  const slow = work(easy, { bellows: 6, crew: 4 }, 30);
  const fast = work(hard, { bellows: 6, crew: 4, pace: 5 }, 30);
  assert.ok(fast.swings > slow.swings, 'a hard pace should land more swings');
  assert.ok(fast.scrap > slow.scrap, 'a hard pace should ruin more');
  assert.ok(hard.morale < easy.morale, 'a hard pace should cost morale');
});

test('your own hands are capped however hard you tap', () => {
  const state = S.newRun(CFG);
  const cap = S.handCap(state);
  const result = work(state, { bellows: 6 }, cap * 10);
  assert.equal(result.hands, cap);
  assert.ok(result.swings <= cap + 1e-9, 'swings beyond the cap were counted');
});

test('tooling arrives a shift late and then multiplies everything', () => {
  const state = S.newRun(CFG);
  const ordered = work(state, { bellows: 6, dies: 3 }, 30);
  assert.equal(ordered.tooling, 1, 'tooling ordered today may not work today');
  assert.equal(state.dieSets, 0);
  const next = work(state, { bellows: 6 }, 30);
  assert.equal(next.arrived, 3);
  assert.ok(next.tooling > 1);
});

test('a share of the rack goes past truing every shift', () => {
  const state = S.newRun(CFG);
  state.dieSets = 20;
  state.coin = 500;
  const result = work(state, { bellows: 6 }, 20);
  assert.ok(result.worn > 0, 'nothing wore out');
  assert.ok(state.dieSets < 20, `the rack stayed at ${state.dieSets}`);
  // And it settles rather than climbing for ever: ordering the maximum every
  // shift reaches an equilibrium, not the moon.
  state.coin = 100_000;
  for (let i = 0; i < 40; i++) work(state, { bellows: 6, dies: S.LEVER_MAX.dies }, 20);
  assert.ok(state.dieSets < S.LEVER_MAX.dies / S.DIE_DECAY + 1,
    `the rack ran away to ${state.dieSets}`);
});

test('the purse cannot be overspent — the set-up is trimmed to fit', () => {
  const state = S.newRun(CFG);
  state.coin = 2;
  state.levels = { bellows: 10, crew: 5, dies: 5, pace: 3 };
  S.affordShift(state);
  assert.ok(S.shiftSpend(state.levels, state) <= state.coin);
  assert.equal(state.levels.pace, 3, 'the pace costs nothing and is never trimmed');
});

test('tooling you cannot keep true is sold on, and refunds exactly the upkeep it saves', () => {
  const state = S.newRun(CFG);
  state.dieSets = 30;
  state.coin = 1;
  const sold = S.affordShift(state);
  assert.ok(sold > 0, 'nothing was sold');
  assert.ok(S.dieUpkeep(state.dieSets, state.mods.wear) <= state.coin + 0.02);
});

/**
 * The dead end this guards against: a shift that ends in the red leaves
 * nothing to trim and nothing to sell, and a naive "can you pay the bill?"
 * check then refuses to let the shop open at all — for ever, with no way back.
 * A debt is a debt. It is not a locked gate.
 */
test('a shop in the red can still open its doors', () => {
  const state = S.newRun(CFG);
  state.coin = -3;
  state.dieSets = 0;
  S.affordShift(state);
  assert.equal(S.shiftSpend(state.levels, state), 0, 'there was nothing left to trim');
  assert.ok(S.affordable(state.levels, state), 'a shift costing nothing must always be workable');

  // And it digs itself out on the retainer alone.
  work(state, {});
  assert.ok(state.coin > -3, `the purse went from -3 to ${state.coin}`);
});

test('a shop in the red still cannot buy anything', () => {
  const state = S.newRun(CFG);
  state.coin = -3;
  assert.equal(S.affordable({ ...S.NO_LEVELS, bellows: 1 }, state), false);
  assert.equal(S.affordable({ ...S.NO_LEVELS, pace: 5 }, state), true, 'the pace is always free');
});

test('affordShift always leaves a set-up that can actually be worked', () => {
  for (const coin of [-50, -1, 0, 0.4, 3, 40]) {
    for (const dieSets of [0, 2, 30]) {
      const state = S.newRun(CFG);
      state.coin = coin;
      state.dieSets = dieSets;
      state.levels = { bellows: 10, crew: 5, dies: 5, pace: 2 };
      S.affordShift(state);
      assert.ok(S.affordable(state.levels, state),
        `coin ${coin}, ${dieSets} sets: left a set-up costing ${S.shiftSpend(state.levels, state)}`);
    }
  }
});

test('a shortfall that outlives every die set stays owed', () => {
  const state = S.newRun(CFG);
  state.dieSets = 1;
  state.coin = -50;
  work(state, {});
  assert.ok(state.coin < 0, 'selling the rack should not have conjured money');
  assert.equal(state.dieSets, 0);
});

test('offcuts in the yard are worked before anything is bought in', () => {
  const bare = S.newRun(CFG);
  const stocked = S.newRun(CFG);
  stocked.offcuts = 10_000;
  const paid = work(bare, { bellows: 6, crew: 3 }, 40);
  const free = work(stocked, { bellows: 6, crew: 3 }, 40);
  assert.ok(paid.materials > 0);
  assert.equal(free.materials, 0);
  assert.ok(stocked.offcuts < 10_000, 'the yard should have been drawn down');
});

test('the foreman says cold when it is cold and burnt when it is burnt', () => {
  const state = S.newRun(CFG);
  const best = S.bestBellows(state, 20);
  const cold = work(S.newRun(CFG), { bellows: 0, crew: 2 }, 20).notes.join(' ');
  const hot = work(S.newRun(CFG), { bellows: S.LEVER_MAX.bellows, crew: 2 }, 20).notes.join(' ');
  const right = work(S.newRun(CFG), { bellows: best, crew: 2 }, 20).notes.join(' ');
  assert.match(cold, /dull|stiff|cracked|more fire/i);
  assert.match(hot, /burning|sparks|scaling/i);
  assert.match(right, /butter|do it again/i);
});

test('a cold shop with poor coke makes heat dear, never unreachable', () => {
  const easy = S.newRun(CFG);
  const harsh = S.newRun({ ...CFG, mods: { chill: 1.5, coal: 0.75, draught: 0.05 } });
  assert.equal(S.restingHeat(9), S.restingHeat(9), 'the notch buys the same heat everywhere');
  assert.deepEqual(S.heatCurve(easy, 9, 20), S.heatCurve(harsh, 9, 20));
  assert.ok(S.shiftSpend({ ...S.NO_LEVELS, bellows: 9 }, harsh)
    > S.shiftSpend({ ...S.NO_LEVELS, bellows: 9 }, easy) * 1.5, 'the fire should cost far more');
});

test('a season swings what fuel costs, and nothing else', () => {
  const state = S.newRun({ ...CFG, shifts: 12, mods: { seasonality: 0.5 } });
  const bills = [];
  for (let i = 0; i < 8; i++) {
    bills.push(S.shiftSpend({ ...S.NO_LEVELS, bellows: 6 }, state));
    work(state, { bellows: 6 }, 10);
  }
  assert.ok(Math.max(...bills) > Math.min(...bills) * 1.2, 'the season never moved the bill');
});

test('scoring ranks on the work that came off clean', () => {
  const good = S.newRun(CFG);
  const bad = S.newRun(CFG);
  const notch = S.bestBellows(good, 20);
  for (let i = 0; i < 5; i++) {
    work(good, { bellows: notch, crew: 3 }, 40);
    work(bad, { bellows: 0, crew: 3 }, 40);
  }
  const a = S.finalScore(good);
  const b = S.finalScore(bad);
  assert.ok(a.pieces > b.pieces);
  assert.ok(a.clean > b.clean);
  assert.notEqual(a.rank.title, b.rank.title);
});

test('a commission is won on pieces delivered against its own target', () => {
  const state = S.newRun({ ...CFG, target: 5 });
  assert.equal(S.finalScore(state).won, false);
  state.pieces = 5;
  assert.equal(S.finalScore(state).won, true);
  assert.equal(S.finalScore(S.newRun(CFG)).won, null, 'an open bench has nothing to win');
});

test('the reference smith never spends money the shop does not have', () => {
  for (const doctrine of [S.DOCTRINES[0], S.DOCTRINES[40], S.DOCTRINES.at(-1)]) {
    const state = S.newRun(CFG);
    while (state.phase !== 'gameover') {
      S.affordShift(state);
      const hands = doctrine.hands * S.handCap(state);
      state.levels = S.referenceLevels(state, doctrine, hands);
      assert.ok(S.shiftSpend(state.levels, state) <= state.coin + 1e-9,
        `shift ${state.shift} committed ${S.shiftSpend(state.levels, state)} of ${state.coin}`);
      state.hands = hands;
      S.commitShift(state, S.simulateShift(state));
    }
  }
});

test('the family of doctrines spans every lever, both timings and both hands', () => {
  const has = (f) => S.DOCTRINES.some(f);
  assert.ok(has((d) => d.hands === 1) && has((d) => d.hands === 0));
  assert.ok(has((d) => d.dies === S.MAX_LEVEL && d.diesEarly));
  assert.ok(has((d) => d.dies === S.MAX_LEVEL && !d.diesEarly));
  assert.ok(has((d) => d.crew === S.MAX_LEVEL) && has((d) => d.crew === 0));
  assert.ok(has((d) => d.fireFirst) && has((d) => !d.fireFirst));
});

test('par is the best of the family, and every alloy can reach it', () => {
  for (const alloy of S.ALLOYS) {
    const config = { ...CFG, alloyId: alloy.id };
    const par = S.parPieces(config);
    assert.ok(par > 10, `${alloy.name} tops out at ${par.toFixed(1)} pieces`);
    for (const doctrine of [S.DOCTRINES[3], S.DOCTRINES[70]]) {
      assert.ok(S.playDoctrine(config, doctrine) <= par + 1e-9,
        `${alloy.name}: a doctrine beat par`);
    }
  }
});

test('working with your own hands beats leaving it to the shop', () => {
  const config = { ...CFG, alloyId: 'pattern' };
  const best = (f) => Math.max(...S.DOCTRINES.filter(f).map((d) => S.playDoctrine(config, d)));
  assert.ok(best((d) => d.hands === 1) > best((d) => d.hands === 0) * 1.15,
    'the clicker has to be worth clicking');
});
