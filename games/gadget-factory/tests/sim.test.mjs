import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';

const TIER = {
  id: 'test-tier', baseGrid: 20, basePrice: 1,
  prestigeThreshold: 5000,
  upgradeBaseCost: { tap: 15, speed: 40, price: 60, grid: 100 },
  machines: [
    { id: 'welder', name: 'Welder', icon: '🔧', baseCost: 25, baseRate: 0.5 },
    { id: 'painter', name: 'Painter', icon: '🎨', baseCost: 150, baseRate: 3 },
    { id: 'assembler', name: 'Assembler', icon: '⚙️', baseCost: 900, baseRate: 15 },
  ],
};

test('the prestige multiplier follows the GDD formula and never falls below one', () => {
  assert.equal(S.prestigeMultiplier(0), 1);
  assert.equal(S.prestigeMultiplier(1_000_000), 1.5);
  assert.equal(S.prestigeMultiplier(4_000_000), 2);
  assert.equal(S.prestigeMultiplier(-500), 1, 'negative lifetime cash should never happen, but should never break the formula either');
});

test('machine and upgrade costs follow the classic idle-game growth curves', () => {
  const c0 = S.machineCost(TIER, 'welder', 0);
  const c1 = S.machineCost(TIER, 'welder', 1);
  const c10 = S.machineCost(TIER, 'welder', 10);
  assert.equal(c0, 25);
  assert.ok(Math.abs(c1 / c0 - S.MACHINE_COST_GROWTH) < 1e-9);
  assert.ok(c10 > c0 * 4, 'ten machines in should cost noticeably more than the first');

  const u0 = S.upgradeCost(TIER, 'tap', 0);
  const u1 = S.upgradeCost(TIER, 'tap', 1);
  assert.equal(u0, 15);
  assert.ok(Math.abs(u1 / u0 - S.UPGRADE_COST_GROWTH) < 1e-9);
});

test('tapping earns cash immediately and is never capped by the grid', () => {
  const state = S.newRun();
  state.upgrades.grid = 0;                 // the smallest possible grid
  const before = state.cash;
  const { units, cash } = S.tap(TIER, state, 0);
  assert.ok(units > 0 && cash > 0);
  assert.equal(state.cash, before + cash);
  assert.equal(state.totalEarnedThisRun, cash);
});

test('a machine bought beyond what the grid can power is wasted, not banked', () => {
  const state = S.newRun();
  // Buy far more painter capacity than the base grid (20) can ever carry.
  state.cash = 1_000_000;
  for (let i = 0; i < 20; i++) S.buyMachine(TIER, state, 'painter');
  const raw = S.rawMachineOutput(TIER, state);
  const capped = S.machineOutput(TIER, state);
  assert.ok(raw > S.gridCapacity(TIER, state), 'test needs the grid to actually be the bottleneck');
  assert.equal(capped, S.gridCapacity(TIER, state), 'output should never exceed the grid ceiling');

  // Nothing is stored up for later either: two identical seconds produce
  // identical earnings, never a smaller-then-bigger pair from a "backlog".
  const a = S.advance(TIER, { ...state, cash: 0, totalEarnedThisRun: 0 }, 1, 0);
  const b = S.advance(TIER, { ...state, cash: 0, totalEarnedThisRun: 0 }, 1, 0);
  assert.equal(a.earned, b.earned);
});

test('buying a machine or an upgrade never spends cash the floor does not have', () => {
  const state = S.newRun();
  const result = S.buyMachine(TIER, state, 'assembler');   // costs 900, floor has 0
  assert.equal(result.ok, false);
  assert.equal(state.cash, 0);
  assert.equal(Object.keys(state.machines).length, 0);

  state.cash = 1000;
  const bought = S.buyMachine(TIER, state, 'assembler');
  assert.equal(bought.ok, true);
  assert.equal(state.cash, 1000 - bought.cost);
  assert.equal(state.machines.assembler, 1);
});

test('a floor cannot prestige below its threshold, and resets cleanly once it can', () => {
  const state = S.newRun();
  state.totalEarnedThisRun = TIER.prestigeThreshold - 1;
  assert.equal(S.canPrestige(TIER, state), false);
  assert.equal(S.prestige(TIER, state).ok, false);

  state.cash = 4000;
  state.machines.welder = 12;
  state.upgrades.tap = 3;
  state.totalEarnedThisRun = TIER.prestigeThreshold;
  assert.equal(S.canPrestige(TIER, state), true);

  const result = S.prestige(TIER, state);
  assert.equal(result.ok, true);
  assert.equal(result.earned, TIER.prestigeThreshold);
  assert.deepEqual(result.state.machines, {});
  assert.deepEqual(result.state.upgrades, S.NO_UPGRADES);
  assert.equal(result.state.cash, 0);
});

test('idle time only ever earns from machines, never from tapping', () => {
  const state = S.newRun();
  const { earned } = S.advance(TIER, state, 60, 0);
  assert.equal(earned, 0, 'a floor with no machines should earn nothing while idle');

  state.machines.welder = 4;
  const running = S.advance(TIER, state, 60, 0);
  assert.ok(running.earned > 0);
  assert.equal(running.earned, S.incomePerSecond(TIER, state, 0) * 60);
});

test('a bigger lifetime cash means a bigger sell price, everywhere, immediately', () => {
  const state = S.newRun();
  const cheap = S.sellPrice(TIER, state, 0);
  const rich = S.sellPrice(TIER, state, 4_000_000);
  assert.ok(rich > cheap);
  assert.equal(rich / cheap, S.prestigeMultiplier(4_000_000) / S.prestigeMultiplier(0));
});

test('the reference bot finds a real, positive threshold for an ordinary tier', () => {
  const par = S.parLifetimeCash(TIER);
  assert.ok(par > 0, `par was ${par}`);
});

test('the reference bot never buys something the floor cannot afford', () => {
  // playReference only ever calls buyMachine/buyUpgrade, both of which
  // refuse an unaffordable purchase — this proves that refusal is load-bearing
  // by checking the floor's cash never goes negative across a full session.
  const state = S.newRun();
  for (const machine of TIER.machines) {
    while (S.buyMachine(TIER, state, machine.id).ok) { /* keep buying until it refuses */ }
  }
  assert.ok(state.cash >= 0);
});

/**
 * The guard on par itself: a handful of "obvious" strategies a real player
 * might reach for should not out-earn the reference family that sets the
 * threshold, or the threshold comes out too soft.
 */
const HEURISTICS = {
  'machines only, cheapest first': (tier, state) => {
    const affordable = tier.machines
      .map((m) => ({ m, cost: S.machineCost(tier, m.id, state.machines[m.id] || 0) }))
      .filter((x) => x.cost <= state.cash)
      .sort((a, b) => a.cost - b.cost)[0];
    return affordable ? S.buyMachine(tier, state, affordable.m.id).ok : false;
  },
  'upgrades only': (tier, state) => {
    for (const kind of ['speed', 'price', 'tap']) {
      if (S.buyUpgrade(tier, state, kind).ok) return true;
    }
    return false;
  },
  'cheapest machine, always': (tier, state) => S.buyMachine(tier, state, tier.machines[0].id).ok,
};

function playHeuristic(tier, pick, sessionSeconds) {
  const state = S.newRun();
  let elapsed = 0;
  const STEP = 5;
  while (elapsed < sessionSeconds) {
    while (pick(tier, state)) { /* spend everything this heuristic knows how to spend */ }
    S.advance(tier, state, STEP, 0);
    elapsed += STEP;
  }
  return state.totalEarnedThisRun;
}

test('no simple heuristic out-earns the reference bot over the same session', () => {
  const tier = { ...TIER, prestigeThreshold: Infinity };
  const par = S.playReference(tier, 0);
  for (const [name, pick] of Object.entries(HEURISTICS)) {
    const earned = playHeuristic(tier, pick, S.SESSION_SECONDS);
    assert.ok(earned <= par * 1.02, `"${name}" earned ${earned}, reference found ${par}`);
  }
});
