import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';

test('the trade is 25 cities of 25 workshops', () => {
  assert.equal(C.CITIES.length, 25);
  assert.equal(C.TIER_LAYOUT.length, C.WORKSHOPS_PER_CITY);
  for (const city of C.CITIES) {
    assert.equal(C.workshopsFor(city.id).length, 25, city.id);
  }
});

test('every city has a unique id, a challenge and somewhere to put a workshop', () => {
  const ids = new Set();
  for (const city of C.CITIES) {
    assert.ok(!ids.has(city.id), `duplicate city ${city.id}`);
    ids.add(city.id);
    assert.ok(city.challenge.name && city.challenge.blurb, city.id);
    assert.ok(city.quarters.length >= 6 && city.places.length >= 5, city.id);
  }
});

test('the tier ramp is 7 / 7 / 7 / 4', () => {
  const counts = C.TIER_LAYOUT.reduce((acc, t) => ({ ...acc, [t]: (acc[t] || 0) + 1 }), {});
  assert.deepEqual(counts, { easy: 7, medium: 7, hard: 7, impossible: 4 });
  for (const tier of Object.values(C.TIERS)) {
    assert.ok(tier.parFactor > 0 && tier.parFactor <= 1, tier.id);
    assert.ok(tier.shifts > 0 && tier.purse > 0 && tier.retainer > 0, tier.id);
  }
});

test('workshops generate the same way every time, with distinct names', () => {
  for (const cityId of ['sheffield', 'damascus', 'norilsk']) {
    const a = C.workshopsFor(cityId);
    const b = C.workshopsFor(cityId);
    assert.deepEqual(a, b);
    assert.equal(new Set(a.map((w) => w.name)).size, a.length, `${cityId} has duplicate names`);
    for (const w of a) assert.ok(S.ALLOY_INDEX[w.alloyId], `${w.name} has no alloy`);
  }
});

test('modifiers multiply, but draughts and seasons add', () => {
  const merged = C.mergeMods({ chill: 1.5, draught: 0.03 }, { chill: 2, draught: 0.04 });
  assert.equal(merged.chill, 3);
  assert.ok(Math.abs(merged.draught - 0.07) < 1e-9);
});

test('cities open two at a time', () => {
  const campaign = C.newCampaign();
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[0].id), true);
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[1].id), true);
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[2].id), false);

  campaign.held[C.CITIES[0].id] = [...Array(C.WORKSHOPS_PER_CITY).keys()];
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[2].id), true);
  assert.equal(C.isCityUnlocked(campaign, C.CITIES[3].id), false);
});

test('workshops unlock one at a time, in order', () => {
  const campaign = C.newCampaign();
  const id = C.CITIES[0].id;
  assert.equal(C.isWorkshopUnlocked(campaign, id, 0), true);
  assert.equal(C.isWorkshopUnlocked(campaign, id, 1), false);
  C.holdWorkshop(campaign, id, 0, 100);
  assert.equal(C.isWorkshopUnlocked(campaign, id, 1), true);
  assert.equal(C.isWorkshopUnlocked(campaign, id, 2), false);
  assert.equal(C.nextWorkshop(campaign, id), 1);
});

test('holding a workshop banks capital for the pieces it delivered', () => {
  const campaign = C.newCampaign();
  C.holdWorkshop(campaign, C.CITIES[0].id, 0, 1000);
  assert.equal(campaign.capital, Math.round(1000 * C.CAPITAL_PER_PIECE * 100) / 100);
  assert.equal(campaign.stats.piecesMade, 1000);
});

test('the guild opens on the fifth completed city', () => {
  const campaign = C.newCampaign();
  let result;
  for (let c = 0; c < C.CITIES_FOR_GUILD; c++) {
    const id = C.CITIES[c].id;
    for (let i = 0; i < C.WORKSHOPS_PER_CITY; i++) {
      result = C.holdWorkshop(campaign, id, i, 10);
    }
    assert.equal(C.cityDone(campaign, id), true);
  }
  assert.equal(C.guildUnlocked(campaign), true);
  assert.equal(result.guildJustUnlocked, true);
  assert.equal(C.campaignProgress(campaign).cities, C.CITIES_FOR_GUILD);
});

test('a locked city hides its workshops too', () => {
  const campaign = C.newCampaign();
  const far = C.CITIES[20].id;
  assert.equal(C.isCityUnlocked(campaign, far), false);
  assert.equal(C.isWorkshopUnlocked(campaign, far, 0), false);
});

test('every workshop explains itself before you stake anything on it', () => {
  for (const city of C.CITIES) {
    const config = C.runConfigFor(city.id, 12);
    assert.ok(config.shifts > 0 && config.purse > 0);
    assert.ok(S.ALLOY_INDEX[config.alloyId]);
    // Any shop bending a rule should say so in plain words.
    const notes = C.describeMods(config.mods);
    assert.ok(Array.isArray(notes));
    for (const note of notes) assert.ok(note.icon && note.text, city.id);
  }
});

test('nothing a workshop shows you gives away what the metal wants', () => {
  // The briefing may say anything about the shop; it may not say anything
  // about the working heat, because finding that is the whole game.
  for (const city of C.CITIES.slice(0, 5)) {
    const said = C.describeMods(C.runConfigFor(city.id, 3).mods).map((n) => n.text).join(' ');
    assert.doesNotMatch(said, /working heat|the heat it wants|ideal|window/i, city.id);
  }
});

test('a cached target never moves under the player', () => {
  const campaign = C.newCampaign();
  const first = C.targetFor(campaign, 'sheffield', 3);
  campaign.targets['sheffield:3'] = first + 999;   // whatever is cached is what is used
  assert.equal(C.targetFor(campaign, 'sheffield', 3), first + 999);
});

// The load-bearing invariant: no workshop may ask for more pieces than the best
// reference smith can actually deliver there. Walks all 625.
test('no workshop asks for more than it can give', { timeout: 240_000 }, () => {
  const campaign = C.newCampaign();
  let checked = 0;
  for (const city of C.CITIES) {
    for (let i = 0; i < C.WORKSHOPS_PER_CITY; i++) {
      const target = C.targetFor(campaign, city.id, i);
      const par = S.parPieces(C.runConfigFor(city.id, i));
      assert.ok(target > 0, `${city.id}:${i} target was ${target}`);
      assert.ok(target <= Math.round(par) + 1,
        `${city.id}:${i} asks ${target} but par is ${Math.round(par)}`);
      checked += 1;
    }
  }
  assert.equal(checked, 625);
});

/**
 * A target of one piece is a target nobody can miss and nobody can read. Every
 * workshop has to be worth the shifts it costs, which means par has to be a
 * real number everywhere — including the coldest, poorest, fussiest shop in
 * the campaign.
 */
test('every workshop in the campaign is worth working', { timeout: 240_000 }, () => {
  const campaign = C.newCampaign();
  let worst = Infinity;
  let worstAt = null;
  for (const city of C.CITIES) {
    for (let i = 0; i < C.WORKSHOPS_PER_CITY; i++) {
      const target = C.targetFor(campaign, city.id, i);
      if (target < worst) { worst = target; worstAt = `${city.id}:${i}`; }
    }
  }
  assert.ok(worst >= 8, `${worstAt} only asks for ${worst} pieces`);
});

/**
 * Clearing stale bars.
 *
 * A target is a share of what `parPieces` finds, so a change to the model
 * makes every cached bar an honest number for a game that no longer exists.
 * The migration drops them; everything that is not a claim about difficulty
 * stays.
 */
test('a campaign measured against an older model has its bars re-measured', () => {
  const campaign = C.newCampaign();
  campaign.held = { sheffield: [0, 1, 2] };
  campaign.capital = 42.5;
  campaign.stats = { runsPlayed: 9, runsWon: 3, piecesMade: 1234 };
  campaign.guild = { shift: 7, depots: { sheffield: { capacity: 1, bars: 2 } }, smiths: {} };
  campaign.targets = { 'sheffield:0': 111, 'sheffield:1': 222, 'seki:4': 333 };
  campaign.targetModel = 0;                       // measured against an older model

  const result = C.migrateCampaign(campaign);

  assert.equal(result.from, 0);
  assert.equal(result.cleared, 3, 'every stale bar should have been dropped');
  assert.deepEqual(campaign.targets, {}, 'no stale bar should survive');
  assert.equal(campaign.targetModel, C.TARGET_MODEL_VERSION);

  // Nothing that is not a claim about difficulty may be touched.
  assert.deepEqual(campaign.held, { sheffield: [0, 1, 2] });
  assert.equal(campaign.capital, 42.5);
  assert.deepEqual(campaign.stats, { runsPlayed: 9, runsWon: 3, piecesMade: 1234 });
  assert.equal(campaign.guild.shift, 7);
  assert.equal(campaign.guild.depots.sheffield.bars, 2);
});

test('a save with no model stamp at all is treated as the oldest one', () => {
  const campaign = C.newCampaign();
  delete campaign.targetModel;                    // exactly how the first saves look
  campaign.targets = { 'sheffield:0': 999 };
  const result = C.migrateCampaign(campaign);
  assert.equal(result.from, 0);
  assert.equal(result.cleared, 1);
  assert.deepEqual(campaign.targets, {});
});

test('a campaign already on the current model is left alone', () => {
  const campaign = C.newCampaign();
  const bar = C.targetFor(campaign, 'sheffield', 0);
  const result = C.migrateCampaign(campaign);
  assert.equal(result.cleared, 0, 'a current campaign has nothing to clear');
  assert.equal(campaign.targets['sheffield:0'], bar, 'its bars must survive');

  // And migrating twice never clears anything the second time.
  campaign.targetModel = 0;
  assert.equal(C.migrateCampaign(campaign).cleared, 1);
  assert.equal(C.migrateCampaign(campaign).cleared, 0);
});

test('a bar dropped by the migration comes back measured against the model in force', () => {
  const stale = C.newCampaign();
  stale.targetModel = 0;
  stale.targets = { 'sheffield:0': 99_999 };      // a bar no model would ever set
  C.migrateCampaign(stale);

  const fresh = C.newCampaign();
  assert.equal(C.targetFor(stale, 'sheffield', 0), C.targetFor(fresh, 'sheffield', 0),
    're-measured bar should match what a new campaign is given');
});

/**
 * The promise the migration must not break: a bar may be re-measured between
 * commissions, but never while one is being worked. The run takes its own copy
 * of the target when it starts, so clearing the campaign's cache cannot move
 * the bar out from under a commission in progress.
 */
test('clearing the cache never moves the bar under a commission in progress', () => {
  const campaign = C.newCampaign();
  const target = C.targetFor(campaign, 'sheffield', 0);
  const run = S.newRun({ ...C.runConfigFor('sheffield', 0), target });

  campaign.targetModel = 0;
  C.migrateCampaign(campaign);

  assert.equal(run.target, target, 'the run in progress kept the bar it started with');
  assert.equal(S.finalScore(run).target, target);
});

test('the free tier is decided by where a city sits, not by the shop', () => {
  assert.equal(C.isCityFree(C.CITIES[0].id, 3), true);
  assert.equal(C.isCityFree(C.CITIES[2].id, 3), true);
  assert.equal(C.isCityFree(C.CITIES[3].id, 3), false);
  assert.equal(C.isCityFree(C.CITIES[24].id, C.CITIES.length), true);
});

/**
 * The foreman has to be worth reading.
 *
 * The alloy's working heat is never printed, so the only way to find it is the
 * note that comes back at the end of a shift — and the notes distinguish being
 * badly wrong ("most of it cracked") from being nearly right ("it would take a
 * little more fire"). This plays a whole tier as somebody who does nothing
 * clever except follow that advice: no doctrine, no optimisation, one fixed
 * set-up and a bellows notch walked towards whatever the foreman implied.
 *
 * If it stops winning the Easy tier, the hidden information has stopped being
 * discoverable, and the game has quietly become a guessing game.
 */
function playsByEar(config) {
  const state = S.newRun(config);
  let notch = 5;                       // start in the middle and listen
  while (state.phase !== 'gameover') {
    S.affordShift(state);
    const want = { bellows: notch, crew: 5, dies: 3, pace: 1 };
    const levels = { ...S.NO_LEVELS, pace: want.pace };
    for (const key of ['bellows', 'crew', 'dies']) {
      for (let n = want[key]; n > 0; n--) {
        const trial = { ...levels, [key]: n };
        if (S.shiftSpend(trial, state) <= state.coin) { levels[key] = n; break; }
      }
    }
    state.levels = levels;
    state.hands = S.handCap(state);
    const result = S.simulateShift(state);
    S.commitShift(state, result);

    const said = result.notes.join(' ');
    if (/most of it cracked|dull and stiff/i.test(said)) notch = Math.min(S.LEVER_MAX.bellows, notch + 2);
    else if (/burning|sparks everywhere/i.test(said)) notch = Math.max(0, notch - 2);
    else if (/more fire/i.test(said)) notch = Math.min(S.LEVER_MAX.bellows, notch + 1);
    else if (/less draught|scaling/i.test(said)) notch = Math.max(0, notch - 1);
  }
  return state.pieces;
}

test('somebody who only listens to the foreman can win the Easy tier', { timeout: 240_000 }, () => {
  const campaign = C.newCampaign();
  let won = 0;
  let played = 0;
  for (const city of C.CITIES) {
    for (const i of [0, 3, 6]) {                 // three Easy workshops per city
      assert.equal(C.workshopsFor(city.id)[i].tier, 'easy');
      const target = C.targetFor(campaign, city.id, i);
      if (playsByEar(C.runConfigFor(city.id, i)) >= target) won += 1;
      played += 1;
    }
  }
  assert.ok(won / played >= 0.8,
    `listening to the foreman only won ${won}/${played} — the hints have stopped being readable`);
});

test('and the hardest tier still needs more than a good ear', { timeout: 240_000 }, () => {
  const campaign = C.newCampaign();
  let won = 0;
  let played = 0;
  for (const city of C.CITIES) {
    for (const i of [21, 24]) {
      assert.equal(C.workshopsFor(city.id)[i].tier, 'impossible');
      const target = C.targetFor(campaign, city.id, i);
      if (playsByEar(C.runConfigFor(city.id, i)) >= target) won += 1;
      played += 1;
    }
  }
  assert.ok(won / played <= 0.35,
    `an unoptimised ear won ${won}/${played} of the Impossible tier — the top of the ramp is too soft`);
});
