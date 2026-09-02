/**
 * Pure-JS Monte Carlo used to pick FREE_PLAY_STAKES in js/sim.js: replays a
 * "reckless" buying/pricing policy (tools/reckless-persona.mjs) against
 * sim.js directly (no browser), so thousands of seasons run in seconds. For
 * each free-play difficulty tier, binary-searches the starting stake that
 * gives a careless player roughly the target bankruptcy rate over a full
 * 30-day season.
 *
 *   node tools/calibrate-freeplay.mjs
 *
 * Re-run this whenever the target bankruptcy rates change, or after a
 * balance change to buying/pricing/spoilage that might shift the odds —
 * then copy the resulting stakes into FREE_PLAY_STAKES.
 */
import * as S from '../js/sim.js';
import { playReckless, round2 } from './reckless-persona.mjs';

function bankruptcyRate(stake, days, trials) {
  let bankrupt = 0;
  for (let i = 0; i < trials; i++) {
    const state = playReckless({ days, stake, target: null });
    if (state.bankrupt) bankrupt++;
  }
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
