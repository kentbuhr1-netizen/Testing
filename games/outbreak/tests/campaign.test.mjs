import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';

test('the world is 25 regions of 25 districts', () => {
  assert.equal(C.REGIONS.length, 25);
  assert.equal(C.TIER_LAYOUT.length, C.DISTRICTS_PER_REGION);
  for (const region of C.REGIONS) {
    assert.equal(C.districtsFor(region.id).length, 25, region.id);
  }
});

test('every region has a unique id, a challenge and somewhere to put a district', () => {
  const ids = new Set();
  for (const region of C.REGIONS) {
    assert.ok(!ids.has(region.id), `duplicate region ${region.id}`);
    ids.add(region.id);
    assert.ok(region.challenge.name && region.challenge.blurb, region.id);
    assert.ok(region.wards.length >= 6 && region.places.length >= 5, region.id);
  }
});

test('the tier ramp is 7 / 7 / 7 / 4', () => {
  const counts = C.TIER_LAYOUT.reduce((acc, t) => ({ ...acc, [t]: (acc[t] || 0) + 1 }), {});
  assert.deepEqual(counts, { easy: 7, medium: 7, hard: 7, impossible: 4 });
  for (const tier of Object.values(C.TIERS)) {
    assert.ok(tier.parFactor > 0 && tier.parFactor <= 1, tier.id);
  }
});

test('districts generate the same way every time, with distinct names', () => {
  for (const regionId of ['wellington', 'miami', 'dhaka']) {
    const a = C.districtsFor(regionId);
    const b = C.districtsFor(regionId);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.map((d) => d.name)).size, a.length, `${regionId} has duplicate names`);
    for (const d of a) assert.ok(S.PATHOGEN_INDEX[d.pathogenId], `${d.name} has no pathogen`);
  }
});

test('modifiers multiply, but arrivals and seasons add', () => {
  const merged = C.mergeMods({ density: 1.5, imports: 3 }, { density: 2, imports: 4 });
  assert.equal(merged.density, 3);
  assert.equal(merged.imports, 7);
});

test('regions open two at a time', () => {
  const campaign = C.newCampaign();
  assert.equal(C.isRegionUnlocked(campaign, C.REGIONS[0].id), true);
  assert.equal(C.isRegionUnlocked(campaign, C.REGIONS[1].id), true);
  assert.equal(C.isRegionUnlocked(campaign, C.REGIONS[2].id), false);

  campaign.held[C.REGIONS[0].id] = [...Array(C.DISTRICTS_PER_REGION).keys()];
  assert.equal(C.isRegionUnlocked(campaign, C.REGIONS[2].id), true);
  assert.equal(C.isRegionUnlocked(campaign, C.REGIONS[3].id), false);
});

test('districts unlock one at a time, in order', () => {
  const campaign = C.newCampaign();
  const id = C.REGIONS[0].id;
  assert.equal(C.isDistrictUnlocked(campaign, id, 0), true);
  assert.equal(C.isDistrictUnlocked(campaign, id, 1), false);
  C.holdDistrict(campaign, id, 0, 100);
  assert.equal(C.isDistrictUnlocked(campaign, id, 1), true);
  assert.equal(C.isDistrictUnlocked(campaign, id, 2), false);
  assert.equal(C.nextDistrict(campaign, id), 1);
});

test('holding a district banks a grant for the lives it saved', () => {
  const campaign = C.newCampaign();
  C.holdDistrict(campaign, C.REGIONS[0].id, 0, 1000);
  assert.equal(campaign.treasury, Math.round(1000 * C.GRANT_PER_LIFE * 100) / 100);
  assert.equal(campaign.stats.livesSaved, 1000);
});

test('the agency unlocks on the fifth completed region', () => {
  const campaign = C.newCampaign();
  let result;
  for (let r = 0; r < C.REGIONS_FOR_OPS; r++) {
    const id = C.REGIONS[r].id;
    for (let i = 0; i < C.DISTRICTS_PER_REGION; i++) {
      result = C.holdDistrict(campaign, id, i, 10);
    }
    assert.equal(C.regionDone(campaign, id), true);
  }
  assert.equal(C.opsUnlocked(campaign), true);
  assert.equal(result.opsJustUnlocked, true);
  assert.equal(C.campaignProgress(campaign).regions, C.REGIONS_FOR_OPS);
});

test('a locked region hides its districts too', () => {
  const campaign = C.newCampaign();
  const far = C.REGIONS[20].id;
  assert.equal(C.isRegionUnlocked(campaign, far), false);
  assert.equal(C.isDistrictUnlocked(campaign, far, 0), false);
});

test('every district explains itself before you stake anything on it', () => {
  for (const region of C.REGIONS) {
    const config = C.runConfigFor(region.id, 12);
    assert.ok(config.weeks > 0 && config.funds > 0);
    assert.ok(S.PATHOGEN_INDEX[config.pathogenId]);
    // Any district bending a rule should say so in plain words.
    const notes = C.describeMods(config.mods);
    assert.ok(Array.isArray(notes));
    for (const note of notes) assert.ok(note.icon && note.text, region.id);
  }
});

test('a cached target never moves under the player', () => {
  const campaign = C.newCampaign();
  const first = C.targetFor(campaign, 'wellington', 3);
  campaign.targets['wellington:3'] = first + 999;   // whatever is cached is what is used
  assert.equal(C.targetFor(campaign, 'wellington', 3), first + 999);
});

// The load-bearing invariant: no district may ask for more lives than the best
// reference response can actually save there. Walks all 625.
test('no district asks for more than it can give', { timeout: 120_000 }, () => {
  const campaign = C.newCampaign();
  let checked = 0;
  for (const region of C.REGIONS) {
    for (let i = 0; i < C.DISTRICTS_PER_REGION; i++) {
      const target = C.targetFor(campaign, region.id, i);
      const par = S.parSaved(C.runConfigFor(region.id, i));
      assert.ok(target > 0, `${region.id}:${i} target was ${target}`);
      assert.ok(target <= Math.round(par) + 1,
        `${region.id}:${i} asks ${target} but par is ${Math.round(par)}`);
      checked += 1;
    }
  }
  assert.equal(checked, 625);
});
