/**
 * Pure-JS Monte Carlo for the campaign's four corner tiers, mirroring
 * tools/calibrate-freeplay.mjs's approach for free play. A corner's bar is
 * already a share of near-optimal play (parProfit * parFactor — see
 * campaign.js), which makes "reckless" the wrong stress-test here: even
 * Easy corners are essentially unwinnable by pure random button-mashing,
 * since winning requires approximating the ideal recipe and price at all,
 * not just avoiding ruin. The meaningful question for a skill-based tier is
 * instead "does a decent-but-imperfect player's win rate actually step down
 * tier to tier?" — answered with tools/skilled-persona.mjs, which mirrors
 * the reference bot but drifts off-plan some fraction of days
 * ("sloppiness").
 *
 *   node tools/calibrate-campaign-difficulty.mjs
 *
 * This binary-searches Medium's parFactor for a target win rate at
 * sloppiness=0.3 (a benchmark "typical, engaged but imperfect" player),
 * then reports the full win-rate table across all four tiers at three
 * sloppiness levels so the whole staircase can be eyeballed at once.
 * Re-run after any balance change that could shift the odds, and update
 * TIERS in campaign.js with the result.
 */
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';
import { playSkilled } from './skilled-persona.mjs';

const round2 = (n) => Math.round(n * 100) / 100;

// par doesn't depend on parFactor or the trial's own randomness — cache it per corner.
const parCache = new Map();
function parFor(config) {
  const key = JSON.stringify(config);
  if (!parCache.has(key)) parCache.set(key, S.parProfit(config));
  return parCache.get(key);
}

/** Win rate for one tier at a candidate parFactor, aggregated across every city. */
function winRate(tierId, parFactor, sloppiness, trialsPerCorner) {
  const cornerIndices = C.TIER_LAYOUT.map((t, i) => (t === tierId ? i : null)).filter((i) => i != null);
  let wins = 0, n = 0;
  for (const city of C.CITIES) {
    for (const index of cornerIndices) {
      const config = C.runConfigFor(city.id, index);
      const target = Math.max(5, Math.round(parFor(config) * parFactor));
      for (let t = 0; t < trialsPerCorner; t++) {
        const state = playSkilled({ ...config, target: null }, sloppiness);
        n++;
        if (!state.bankrupt && state.money - state.stake >= target) wins++;
      }
    }
  }
  return wins / n;
}

function calibrateParFactor(tierId, targetRate, sloppiness, trials, lo = 0.1, hi = 0.98) {
  for (let iter = 0; iter < 12; iter++) {
    const mid = round2((lo + hi) / 2);
    const rate = winRate(tierId, mid, sloppiness, trials);
    console.log(`    parFactor ${mid.toFixed(2)} -> win rate ${(rate * 100).toFixed(1)}%`);
    if (rate > targetRate) lo = mid; // too easy -> need a higher bar
    else hi = mid;
  }
  return round2((lo + hi) / 2);
}

const SLOPPINESS = 0.3; // the "typical engaged but imperfect" benchmark player
const TARGET_MEDIUM_WIN_RATE = 0.90;

console.log(`=== medium: calibrating parFactor for ~${TARGET_MEDIUM_WIN_RATE * 100}% win rate at sloppiness=${SLOPPINESS} ===`);
const mediumFactor = calibrateParFactor('medium', TARGET_MEDIUM_WIN_RATE, SLOPPINESS, 40);
const verified = winRate('medium', mediumFactor, SLOPPINESS, 300);
console.log(`  -> chosen parFactor ${mediumFactor}, verified win rate ${(verified * 100).toFixed(1)}% (n=300/corner)`);

console.log('\n=== Full win-rate staircase (medium at the calibrated factor, others as configured) ===');
for (const sloppiness of [0.15, 0.3, 0.5]) {
  const rates = {};
  for (const tierId of Object.keys(C.TIERS)) {
    const pf = tierId === 'medium' ? mediumFactor : C.TIERS[tierId].parFactor;
    rates[tierId] = winRate(tierId, pf, sloppiness, 25);
  }
  console.log(`sloppiness=${sloppiness}:`, Object.entries(rates).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join('  '));
}
