/**
 * Pure-JS Monte Carlo used to pick FREE_PLAY_STAKES in js/sim.js: replays a
 * "reckless" buying/pricing policy against sim.js directly (no browser), so
 * thousands of seasons run in seconds. For each free-play difficulty tier,
 * binary-searches the starting stake that gives a careless player roughly
 * the target bankruptcy rate over a full 30-day season.
 *
 *   node tools/calibrate-freeplay.mjs
 *
 * Re-run this whenever the target bankruptcy rates change, or after a
 * balance change to buying/pricing/spoilage that might shift the odds —
 * then copy the resulting stakes into FREE_PLAY_STAKES.
 */
import * as S from '../js/sim.js';

const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const round2 = (n) => Math.round(n * 100) / 100;

const ORDER_FIELDS = [
  ['lemons', 5], ['sugar', 5], ['ice', 25],
  ['cupsSmall', 10], ['cups', 10], ['cupsLarge', 10],
];

function totalOrderCost(prices, order) {
  return round2(S.buyCost(prices, order) + S.sizedCupOrderCost(prices, order) + S.enhancerOrderCost(order.enhancers));
}

function emptyOrder() {
  return { lemons: 0, sugar: 0, ice: 0, cups: 0, cupsSmall: 0, cupsLarge: 0, enhancers: {} };
}

/** One reckless shopping trip: several random affordable increments. */
function recklessBuy(state, reckless) {
  const order = emptyOrder();
  const picks = reckless ? rand(4, 7) : rand(1, 3);
  for (let i = 0; i < picks; i++) {
    const [field, step] = pick(ORDER_FIELDS);
    const trial = { ...order, [field]: order[field] + step };
    if (totalOrderCost(state.today.prices, trial) <= state.money) order[field] = trial[field];
  }
  const cost = totalOrderCost(state.today.prices, order);
  if (cost <= state.money) {
    state.money = round2(state.money - cost);
    S.receiveOrder(state, order);
  }
}

/** Fiddles the recipe and price like someone who has no idea what "ideal" means. */
function recklessSetup(state) {
  if (chance(0.5)) {
    for (let i = 0; i < rand(1, 3); i++) {
      const field = pick(['lemons', 'sugar', 'ice']);
      const [lo, hi] = field === 'ice' ? [0, 7] : [1, 12];
      const step = chance(0.5) ? 1 : -1;
      state.recipe[field] = Math.min(hi, Math.max(lo, state.recipe[field] + step));
    }
  }
  if (chance(0.3)) {
    for (let i = 0; i < rand(1, 3); i++) {
      const step = chance(0.5) ? 0.05 : -0.05;
      state.price = round2(Math.min(5, Math.max(0.05, state.price + step)));
    }
  }
}

/** Runs one full reckless free-play season; returns true if it ended in bankruptcy. */
function playOneSeason(stake, days) {
  const state = S.newRun({ days, stake, target: null });
  const reckless = chance(0.2);
  while (state.phase !== 'gameover') {
    recklessBuy(state, reckless);
    recklessSetup(state);
    const pending = S.simulateDay(state);
    S.commitDay(state, pending);
  }
  return Boolean(state.bankrupt);
}

function bankruptcyRate(stake, days, trials) {
  let bankrupt = 0;
  for (let i = 0; i < trials; i++) if (playOneSeason(stake, days)) bankrupt++;
  return bankrupt / trials;
}

/** Binary-searches stake (holding days fixed) to hit a target bankruptcy rate. */
function calibrateStake(target, days, trials, lo = 5, hi = 200) {
  for (let iter = 0; iter < 14; iter++) {
    const mid = round2((lo + hi) / 2);
    const rate = bankruptcyRate(mid, days, trials);
    console.log(`    stake $${mid.toFixed(2)} -> bankruptcy ${(rate * 100).toFixed(1)}%`);
    if (rate > target) lo = mid; // too much bankruptcy -> need more stake
    else hi = mid;
  }
  return round2((lo + hi) / 2);
}

const TIERS = [
  { id: 'easy', target: 0.10 },
  { id: 'medium', target: 0.20 },
  { id: 'hard', target: 0.50 },
  { id: 'impossible', target: 0.75 },
];
const DAYS = S.TOTAL_DAYS; // keep the free-play season length the same across tiers
const TRIALS_PER_STEP = 3000;
const FINAL_VERIFY_TRIALS = 8000;

const results = {};
for (const tier of TIERS) {
  console.log(`\n=== ${tier.id} (target ${(tier.target * 100).toFixed(0)}%) ===`);
  const stake = calibrateStake(tier.target, DAYS, TRIALS_PER_STEP);
  const verified = bankruptcyRate(stake, DAYS, FINAL_VERIFY_TRIALS);
  console.log(`  -> chosen stake $${stake.toFixed(2)}, verified bankruptcy rate ${(verified * 100).toFixed(1)}% (n=${FINAL_VERIFY_TRIALS})`);
  results[tier.id] = { stake, days: DAYS, targetRate: tier.target, verifiedRate: round2(verified * 1000) / 1000 };
}

console.log('\n=== FINAL CONFIG ===');
console.log(JSON.stringify(results, null, 2));
