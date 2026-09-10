import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';

test('the ladder is five product lines, each with its own catalog', () => {
  assert.equal(C.TIERS.length, 5);
  const ids = new Set(C.TIERS.map((t) => t.id));
  assert.equal(ids.size, 5, 'tier ids must be unique');
  for (const tier of C.TIERS) {
    assert.ok(tier.name && tier.icon && tier.blurb, tier.id);
    assert.ok(tier.machines.length >= 3, `${tier.id} needs at least 3 machines`);
    for (const key of ['tap', 'speed', 'price', 'grid']) {
      assert.ok(tier.upgradeBaseCost[key] > 0, `${tier.id} missing upgradeBaseCost.${key}`);
    }
  }
});

/**
 * The load-bearing invariant, this game's shape of "no level asks for more
 * than it can give": every tier's prestige threshold must be a real, positive
 * number, and never more than a well-played session on that exact tier — fed
 * the lifetime cash a player would plausibly carry in from the tier before it
 * — can actually earn.
 */
test('no product line asks for more than a well-played session can give', () => {
  let lifetime = 0;
  for (const tier of C.TIERS) {
    const solo = S.playReference({ ...tier, prestigeThreshold: Infinity }, lifetime);
    assert.ok(tier.prestigeThreshold > 0, `${tier.id} threshold was ${tier.prestigeThreshold}`);
    assert.ok(tier.prestigeThreshold <= Math.round(solo) + 1,
      `${tier.id} asks ${tier.prestigeThreshold} but a session only found ${Math.round(solo)}`);
    lifetime = solo;
  }
});

test('thresholds climb tier to tier, the same way the machine catalogs do', () => {
  for (let i = 1; i < C.TIERS.length; i++) {
    assert.ok(C.TIERS[i].prestigeThreshold >= C.TIERS[i - 1].prestigeThreshold * 0.5,
      `${C.TIERS[i].id} threshold collapsed relative to ${C.TIERS[i - 1].id}`);
  }
});

test('only the first tier is open on a new campaign', () => {
  const campaign = C.newCampaign();
  assert.equal(C.isTierUnlocked(campaign, 0), true);
  assert.equal(C.isTierUnlocked(campaign, 1), false);
  assert.equal(campaign.lifetimeCash, 0);
});

test('a floor is created fresh the first time it is opened, and persists after', () => {
  const campaign = C.newCampaign();
  const floor = C.getFloor(campaign, 'bicycles');
  assert.deepEqual(floor.machines, {});
  floor.cash = 500;
  assert.equal(C.getFloor(campaign, 'bicycles'), floor, 'the same floor object should come back');
  assert.equal(C.getFloor(campaign, 'bicycles').cash, 500);
});

test('a prestige banks lifetime cash and opens exactly the next tier', () => {
  const campaign = C.newCampaign();
  const change = C.recordPrestige(campaign, 0, 10_000);
  assert.equal(campaign.lifetimeCash, 10_000);
  assert.equal(campaign.prestigesByTier[0], 1);
  assert.equal(change.tierJustUnlocked, true);
  assert.equal(C.isTierUnlocked(campaign, 1), true);
  assert.equal(C.isTierUnlocked(campaign, 2), false);

  // Prestiging the same tier again does not re-unlock anything, but still counts.
  const again = C.recordPrestige(campaign, 0, 5_000);
  assert.equal(again.tierJustUnlocked, false);
  assert.equal(campaign.lifetimeCash, 15_000);
  assert.equal(campaign.prestigesByTier[0], 2);
});

test('a prestige banks a share of its earnings into the treasury', () => {
  const campaign = C.newCampaign();
  C.recordPrestige(campaign, 0, 10_000);
  assert.equal(campaign.treasury, Math.round(10_000 * C.TREASURY_SHARE_OF_PRESTIGE * 100) / 100);
});

test('regional offices unlock once TIERS_FOR_OPS tiers have a first prestige, and the announcement fires exactly once', () => {
  const campaign = C.newCampaign();
  assert.equal(C.opsUnlocked(campaign), false);
  for (let i = 0; i < C.TIERS_FOR_OPS; i++) {
    const change = C.recordPrestige(campaign, i, 1000);
    if (i === C.TIERS_FOR_OPS - 1) assert.equal(change.opsJustUnlocked, true);
    else assert.equal(change.opsJustUnlocked, false);
  }
  assert.equal(C.opsUnlocked(campaign), true);

  // A later, unrelated prestige must not re-announce something that already happened.
  const later = C.recordPrestige(campaign, 0, 1000);
  assert.equal(later.opsJustUnlocked, false);
});

test('the final tier prestiging does not try to unlock a sixth one', () => {
  const campaign = C.newCampaign();
  campaign.unlockedTiers = C.TIERS.length;
  const change = C.recordPrestige(campaign, C.TIERS.length - 1, 1000);
  assert.equal(change.tierJustUnlocked, false);
  assert.equal(campaign.unlockedTiers, C.TIERS.length);
});

test('campaign progress reports totals that match the ladder', () => {
  const campaign = C.newCampaign();
  C.recordPrestige(campaign, 0, 2000);
  const progress = C.campaignProgress(campaign);
  assert.equal(progress.totalTiers, C.TIERS.length);
  assert.equal(progress.totalPrestiges, 1);
  assert.equal(progress.lifetimeCash, 2000);
  assert.equal(progress.unlockedTiers, 2);
});
