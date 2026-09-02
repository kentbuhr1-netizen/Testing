/**
 * A "reckless" player policy, shared by the free-play and campaign
 * difficulty calibration tools: several random affordable buys, then
 * recipe/price fiddling like someone with no idea what "ideal" means.
 * Pure sim.js calls, no DOM — thousands of trials run in seconds.
 */
import * as S from '../js/sim.js';

export const rand = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
export const chance = (p) => Math.random() < p;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const round2 = (n) => Math.round(n * 100) / 100;

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
export function recklessBuy(state, reckless) {
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
export function recklessSetup(state) {
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

/** Plays one full reckless run to gameover and returns the finished state. */
export function playReckless(config, { alwaysReckless = false } = {}) {
  const state = S.newRun(config);
  const reckless = alwaysReckless || chance(0.2);
  while (state.phase !== 'gameover') {
    recklessBuy(state, reckless);
    recklessSetup(state);
    const pending = S.simulateDay(state);
    S.commitDay(state, pending);
  }
  return state;
}
