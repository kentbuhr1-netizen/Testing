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

/**
 * Clearing stale bars.
 *
 * A target is a share of what `parSaved` finds, so a change to the model makes
 * every cached bar an honest number for a game that no longer exists. The
 * migration drops them; everything that is not a claim about difficulty stays.
 */
test('a campaign measured against an older model has its bars re-measured', () => {
  const campaign = C.newCampaign();
  campaign.held = { wellington: [0, 1, 2] };
  campaign.treasury = 42.5;
  campaign.stats = { runsPlayed: 9, runsWon: 3, livesSaved: 1234 };
  campaign.ops = { week: 7, labs: { wellington: { capacity: 1, doses: 2 } }, teams: {} };
  campaign.targets = { 'wellington:0': 111, 'wellington:1': 222, 'seoul:4': 333 };
  campaign.targetModel = 1;                       // measured against the old model

  const result = C.migrateCampaign(campaign);

  assert.equal(result.from, 1);
  assert.equal(result.cleared, 3, 'every stale bar should have been dropped');
  assert.deepEqual(campaign.targets, {}, 'no stale bar should survive');
  assert.equal(campaign.targetModel, C.TARGET_MODEL_VERSION);

  // Nothing that is not a claim about difficulty may be touched.
  assert.deepEqual(campaign.held, { wellington: [0, 1, 2] });
  assert.equal(campaign.treasury, 42.5);
  assert.deepEqual(campaign.stats, { runsPlayed: 9, runsWon: 3, livesSaved: 1234 });
  assert.equal(campaign.ops.week, 7);
  assert.equal(campaign.ops.labs.wellington.doses, 2);
});

test('a save with no model stamp at all is treated as the oldest one', () => {
  const campaign = C.newCampaign();
  delete campaign.targetModel;                    // exactly how the first saves look
  campaign.targets = { 'wellington:0': 999 };
  const result = C.migrateCampaign(campaign);
  assert.equal(result.from, 1);
  assert.equal(result.cleared, 1);
  assert.deepEqual(campaign.targets, {});
});

test('a campaign already on the current model is left alone', () => {
  const campaign = C.newCampaign();
  const bar = C.targetFor(campaign, 'wellington', 0);
  const result = C.migrateCampaign(campaign);
  assert.equal(result.cleared, 0, 'a current campaign has nothing to clear');
  assert.equal(campaign.targets['wellington:0'], bar, 'its bars must survive');

  // And migrating twice never clears anything the second time.
  campaign.targetModel = 1;
  assert.equal(C.migrateCampaign(campaign).cleared, 1);
  assert.equal(C.migrateCampaign(campaign).cleared, 0);
});

test('a bar dropped by the migration comes back measured against the model in force', () => {
  const stale = C.newCampaign();
  stale.targetModel = 1;
  stale.targets = { 'wellington:0': 99_999 };     // a bar no model would ever set
  C.migrateCampaign(stale);

  const fresh = C.newCampaign();
  assert.equal(C.targetFor(stale, 'wellington', 0), C.targetFor(fresh, 'wellington', 0),
    're-measured bar should match what a new campaign is given');
});

/**
 * The promise the migration must not break: a bar may be re-measured between
 * districts, but never while one is being played. The run takes its own copy
 * of the target when it starts, so clearing the campaign's cache cannot move
 * the bar out from under an outbreak in progress.
 */
test('clearing the cache never moves the bar under a district in progress', () => {
  const campaign = C.newCampaign();
  const target = C.targetFor(campaign, 'wellington', 0);
  const run = S.newRun({ ...C.runConfigFor('wellington', 0), target });

  campaign.targetModel = 1;
  C.migrateCampaign(campaign);

  assert.equal(run.target, target, 'the run in progress kept the bar it started with');
  assert.equal(S.finalScore(run).target, target);
});
