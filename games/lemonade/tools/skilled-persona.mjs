/**
 * A "skilled but human" player: mirrors parProfit's reference bot (same
 * ideal recipe, same revenue-maximizing price, same buying logic) but with
 * injected imperfection, since a real attentive player doesn't hit the
 * mathematically ideal recipe/price every single day. Used to check that a
 * decent (not perfect) player's win rate ramps down sensibly across the
 * four campaign difficulty tiers — parFactor's actual job.
 */
import * as S from '../js/sim.js';
import { round2 } from './reckless-persona.mjs';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** `sloppiness` is the chance any given day drifts from the reference plan. */
export function skilledPlan(state, sloppiness) {
  const ref = S.referencePlan(state);
  if (Math.random() >= sloppiness) {
    // A good day: right on the reference plan, price rounded to the nearest
    // nickel like a real player would set it.
    return { recipe: ref.recipe, price: Math.round(ref.price * 20) / 20, cups: ref.cups };
  }
  const noise = (mag) => Math.round((Math.random() * 2 - 1) * mag);
  const recipe = {
    lemons: clamp(ref.recipe.lemons + noise(2), 1, 12),
    sugar: clamp(ref.recipe.sugar + noise(2), 1, 12),
    ice: clamp(ref.recipe.ice + noise(1), 0, 7),
  };
  const priceFrac = (Math.random() * 2 - 1) * 0.25; // off by up to 25% on a sloppy day
  const price = clamp(Math.round(ref.price * (1 + priceFrac) * 20) / 20, 0.05, 5);
  return { recipe, price, cups: ref.cups };
}

/** Plays one full run with the skilled-but-human policy; returns the finished state. */
export function playSkilled(config, sloppiness) {
  const state = S.newRun(config);
  while (state.phase !== 'gameover') {
    const plan = skilledPlan(state, sloppiness);
    state.recipe = plan.recipe;
    state.price = plan.price;
    const order = S.affordableOrder(state, plan.recipe, plan.cups);
    state.money = round2(state.money - S.buyCost(state.today.prices, order));
    S.receiveOrder(state, order);
    S.commitDay(state, S.simulateDay(state));
  }
  return state;
}
