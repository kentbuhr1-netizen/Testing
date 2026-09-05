import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';
import * as E from '../js/employees.js';

test('the map is 25 cities across the US and Europe', () => {
  assert.equal(C.CITIES.length, 25);
  assert.equal(new Set(C.CITIES.map((c) => c.id)).size, 25);
  assert.ok(C.CITIES.every((c) => c.region === 'US' || c.region === 'EU'));
  assert.ok(C.CITIES.filter((c) => c.region === 'US').length >= 10);
  assert.ok(C.CITIES.filter((c) => c.region === 'EU').length >= 10);
  assert.ok(C.CITIES.every((c) => c.challenge?.name && c.challenge?.blurb));
});

test('every city has 25 corners running through all four tiers', () => {
  for (const city of C.CITIES) {
    const corners = C.cornersFor(city.id);
    assert.equal(corners.length, 25, city.id);
    assert.equal(new Set(corners.map((c) => c.name)).size, 25, `${city.id} has duplicate corner names`);
    const tiers = corners.reduce((acc, c) => ({ ...acc, [c.tier]: (acc[c.tier] || 0) + 1 }), {});
    assert.deepEqual(tiers, { easy: 7, medium: 7, hard: 7, impossible: 4 }, city.id);
  }
});

test('corners are generated identically every time', () => {
  assert.deepEqual(C.cornersFor('paris'), C.cornersFor('paris'));
});

test('city challenges actually reach the simulation', () => {
  const phoenix = C.runConfigFor('phoenix', 0);
  const seattle = C.runConfigFor('seattle', 0);
  assert.ok(phoenix.mods.tempShift > 10, 'Phoenix should run hot');
  assert.ok(seattle.mods.wetBias > 1.5, 'Seattle should run wet');
  const hot = S.newRun(phoenix);
  const wet = S.newRun(seattle);
  const avg = (state) => {
    let total = 0;
    for (let d = 1; d <= 30; d++) total += S.rollDay({ ...state, day: d }).temp;
    return total / 30;
  };
  assert.ok(avg(hot) > avg(wet) + 15, 'Phoenix should be far hotter than Seattle');
});

test('every corner in the game is winnable', () => {
  // The bar is a share of what near-perfect play clears, so a corner where
  // that play loses money would be impossible for anyone. None may exist.
  const campaign = C.newCampaign();
  const failures = [];
  for (const city of C.CITIES) {
    for (let i = 0; i < C.CORNERS_PER_CITY; i++) {
      const par = S.parProfit(C.runConfigFor(city.id, i));
      const target = C.targetFor(campaign, city.id, i);
      if (par < 12) failures.push(`${city.name} #${i + 1}: par only $${par.toFixed(2)}`);
      if (target > par) failures.push(`${city.name} #${i + 1}: target $${target} above par $${par.toFixed(2)}`);
      if (target < 5) failures.push(`${city.name} #${i + 1}: target $${target} is trivially low`);
    }
  }
  assert.deepEqual(failures, []);
});

test('targets rise with the tier', () => {
  const campaign = C.newCampaign();
  const easy = C.targetFor(campaign, 'nyc', 0);
  const impossible = C.targetFor(campaign, 'nyc', 24);
  assert.ok(impossible > easy * 2, `${impossible} vs ${easy}`);
});

test('parFactor strictly increases tier by tier', () => {
  // Regression guard for tools/calibrate-campaign-difficulty.mjs: a decent-
  // but-imperfect player's win rate should step down smoothly tier to
  // tier, not collapse two tiers into the same difficulty (or invert them).
  const factors = ['easy', 'medium', 'hard', 'impossible'].map((id) => C.TIERS[id].parFactor);
  for (let i = 1; i < factors.length; i++) {
    assert.ok(factors[i] > factors[i - 1], `${factors[i - 1]} -> ${factors[i]} does not strictly increase`);
  }
});

test('a target never moves once it has been seen', () => {
  const campaign = C.newCampaign();
  const first = C.targetFor(campaign, 'rome', 3);
  campaign.targets['rome:3'] = first; // as persisted
  assert.equal(C.targetFor(campaign, 'rome', 3), first);
});

test('two cities are open at the start and finishing one opens the next', () => {
  const campaign = C.newCampaign();
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[0].id), true);
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[1].id), true);
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[2].id), false);

  campaign.claimed[C.CITIES[0].id] = [...Array(25).keys()];
  assert.equal(C.cityDone(campaign, C.CITIES[0].id), true);
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[2].id), true);
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[3].id), false);
});

test('corners unlock one at a time, in order', () => {
  const campaign = C.newCampaign();
  const id = C.CITIES[0].id;
  assert.equal(C.isCornerUnlocked(campaign, id, 0), true);
  assert.equal(C.isCornerUnlocked(campaign, id, 1), false);
  C.claimCorner(campaign, id, 0, 50);
  assert.equal(C.isCornerUnlocked(campaign, id, 1), true);
  assert.equal(C.isCornerUnlocked(campaign, id, 2), false);
  assert.equal(C.nextCorner(campaign, id), 1);
});

test('claiming banks the profit and never double-counts a corner', () => {
  const campaign = C.newCampaign();
  C.claimCorner(campaign, 'nyc', 0, 40);
  C.claimCorner(campaign, 'nyc', 0, 40);
  assert.deepEqual(C.claimedIn(campaign, 'nyc'), [0]);
  assert.equal(campaign.treasury, 80); // the second run still paid out
});

test('the supply chain unlocks on the fifth completed city', () => {
  const campaign = C.newCampaign();
  const ids = C.CITIES.slice(0, 5).map((c) => c.id);
  let result;
  for (const id of ids) {
    for (let i = 0; i < 25; i++) result = C.claimCorner(campaign, id, i, 1);
  }
  assert.equal(C.completedCities(campaign).length, 5);
  assert.equal(C.opsUnlocked(campaign), true);
  assert.equal(result.opsJustUnlocked, true);
  assert.equal(C.campaignProgress(campaign).corners, 125);
});

test('acquiring a corner requires an M&A Specialist, an unlocked corner, and the cash', () => {
  const campaign = C.newCampaign();
  campaign.treasury = 100000;
  const withoutMA = C.acquireCorner(campaign, 'nyc', 0);
  assert.equal(withoutMA.ok, false);
  assert.equal(C.isClaimed(campaign, 'nyc', 0), false);

  E.hire(campaign, 'ma');
  const lockedCorner = C.acquireCorner(campaign, 'nyc', 5); // corner 0 not claimed yet, so 5 is locked
  assert.equal(lockedCorner.ok, false);

  const cost = C.acquisitionCost(campaign, 'nyc', 0);
  const treasuryBefore = campaign.treasury;
  const result = C.acquireCorner(campaign, 'nyc', 0);
  assert.equal(result.ok, true);
  assert.equal(C.isClaimed(campaign, 'nyc', 0), true);
  assert.equal(campaign.treasury, Math.round((treasuryBefore - cost) * 100) / 100);

  const again = C.acquireCorner(campaign, 'nyc', 0);
  assert.equal(again.ok, false, 'already yours');
});

test('an acquisition is a stiff premium over the corner\'s own target', () => {
  const campaign = C.newCampaign();
  const target = C.targetFor(campaign, 'nyc', 0);
  assert.equal(C.acquisitionCost(campaign, 'nyc', 0), Math.round(target * 3 * 100) / 100);
});

test('locked corners stay locked in a locked city', () => {
  const campaign = C.newCampaign();
  const far = C.CITIES[10].id;
  assert.equal(C.isCityUnlocked(campaign, far), false);
  assert.equal(C.isCornerUnlocked(campaign, far, 0), false);
});

test('a corner run carries the target it has to clear', async () => {
  // Regression: the run config once omitted the target, so no corner could
  // ever be claimed however well it was played.
  const { screens } = await import('../js/ui/run.js').catch(() => ({}));
  const campaign = C.newCampaign();
  const config = { ...C.runConfigFor('nyc', 0), target: C.targetFor(campaign, 'nyc', 0) };
  const run = S.newRun(config);
  assert.ok(run.target > 0, 'the run must know its target');
  run.money = run.stake + run.target;
  assert.equal(S.finalScore(run).won, true);
  run.money = run.stake + run.target - 0.01;
  assert.equal(S.finalScore(run).won, false);
});

test('near-perfect play clears an easy corner comfortably', () => {
  const campaign = C.newCampaign();
  for (const cityId of ['nyc', 'seattle', 'reykjavik', 'paris']) {
    for (const i of [0, 3, 6]) {
      const config = C.runConfigFor(cityId, i);
      const par = S.parProfit(config);
      const target = C.targetFor(campaign, cityId, i);
      assert.ok(par >= target * 1.3, `${cityId} #${i + 1}: par $${par} vs target $${target}`);
    }
  }
});
