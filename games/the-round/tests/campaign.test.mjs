import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';

test('the country is 25 towns of 25 rounds', () => {
  assert.equal(C.TOWNS.length, 25);
  assert.equal(C.TIER_LAYOUT.length, C.ROUNDS_PER_TOWN);
  for (const town of C.TOWNS) assert.equal(C.roundsFor(town.id).length, 25, town.id);
});

test('every town has a unique id, a challenge and somewhere to put a round', () => {
  const ids = new Set();
  for (const town of C.TOWNS) {
    assert.ok(!ids.has(town.id), `duplicate town ${town.id}`);
    ids.add(town.id);
    assert.ok(town.challenge.name && town.challenge.blurb, town.id);
    assert.ok(town.areas.length >= 6, town.id);
  }
});

test('the tier ramp is 7 / 7 / 7 / 4 and gets harder throughout', () => {
  const counts = C.TIER_LAYOUT.reduce((acc, t) => ({ ...acc, [t]: (acc[t] || 0) + 1 }), {});
  assert.deepEqual(counts, { easy: 7, medium: 7, hard: 7, impossible: 4 });
  const order = ['easy', 'medium', 'hard', 'impossible'];
  for (let i = 1; i < order.length; i++) {
    assert.ok(C.TIERS[order[i]].days > C.TIERS[order[i - 1]].days, order[i]);
    assert.ok(C.TIERS[order[i]].stake <= C.TIERS[order[i - 1]].stake, order[i]);
  }
});

test('rounds generate the same way every time, with distinct names', () => {
  for (const townId of ['willowbrook', 'draycott', 'cranmoor']) {
    assert.deepEqual(C.roundsFor(townId), C.roundsFor(townId));
    const names = C.roundsFor(townId).map((r) => r.name);
    assert.equal(new Set(names).size, names.length, `${townId} has duplicate names`);
  }
});

test('every modifier on this round multiplies', () => {
  const merged = C.mergeMods({ travel: 1.5, spread: 2 }, { travel: 2 });
  assert.equal(merged.travel, 3);
  assert.equal(merged.spread, 2);
});

test('towns open two at a time', () => {
  const campaign = C.newCampaign();
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[0].id), true);
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[1].id), true);
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[2].id), false);

  campaign.held[C.TOWNS[0].id] = [...Array(C.ROUNDS_PER_TOWN).keys()];
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[2].id), true);
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[3].id), false);
});

test('rounds unlock one at a time, in order', () => {
  const campaign = C.newCampaign();
  const id = C.TOWNS[0].id;
  assert.equal(C.isRoundUnlocked(campaign, id, 0), true);
  assert.equal(C.isRoundUnlocked(campaign, id, 1), false);
  C.holdRound(campaign, id, 0, 100, 12);
  assert.equal(C.isRoundUnlocked(campaign, id, 1), true);
  assert.equal(C.isRoundUnlocked(campaign, id, 2), false);
  assert.equal(C.nextRound(campaign, id), 1);
});

test('holding a round banks the profit and counts the lawns', () => {
  const campaign = C.newCampaign();
  C.holdRound(campaign, C.TOWNS[0].id, 0, 250.5, 40);
  assert.equal(campaign.treasury, 250.5);
  assert.equal(campaign.stats.lawnsCut, 40);
});

test('the firm unlocks on the fifth completed town', () => {
  const campaign = C.newCampaign();
  let result;
  for (let t = 0; t < C.TOWNS_FOR_OPS; t++) {
    const id = C.TOWNS[t].id;
    for (let i = 0; i < C.ROUNDS_PER_TOWN; i++) result = C.holdRound(campaign, id, i, 10, 1);
    assert.equal(C.townDone(campaign, id), true);
  }
  assert.equal(C.opsUnlocked(campaign), true);
  assert.equal(result.opsJustUnlocked, true);
  assert.equal(C.campaignProgress(campaign).towns, C.TOWNS_FOR_OPS);
});

test('a locked town hides its rounds too', () => {
  const campaign = C.newCampaign();
  const far = C.TOWNS[20].id;
  assert.equal(C.isTownUnlocked(campaign, far), false);
  assert.equal(C.isRoundUnlocked(campaign, far, 0), false);
});

test('the free tier is the first towns, positionally', () => {
  assert.equal(C.isTownFree(C.TOWNS[0].id, 3), true);
  assert.equal(C.isTownFree(C.TOWNS[2].id, 3), true);
  assert.equal(C.isTownFree(C.TOWNS[3].id, 3), false);
  assert.equal(C.isTownFree(C.TOWNS[24].id, C.TOWNS.length), true);
});

test('every round explains itself before you take it on', () => {
  for (const town of C.TOWNS) {
    const config = C.runConfigFor(town.id, 12);
    assert.ok(config.days > 0 && config.stake > 0, town.id);
    const notes = C.describeMods(config.mods);
    for (const note of notes) assert.ok(note.icon && note.text, town.id);
  }
  // A town that bends a rule hard should say so.
  assert.ok(C.describeMods(C.runConfigFor('draycott', 0).mods).some((n) => /blade/i.test(n.text)));
  assert.ok(C.describeMods(C.runConfigFor('oakridge', 0).mods).some((n) => /spread|driv/i.test(n.text)));
});

test('a cached target never moves under the player', () => {
  const campaign = C.newCampaign();
  const first = C.targetFor(campaign, 'willowbrook', 3);
  campaign.targets['willowbrook:3'] = first + 999;
  assert.equal(C.targetFor(campaign, 'willowbrook', 3), first + 999);
});

test('a harder town asks for less than an easy one at the same tier', () => {
  const campaign = C.newCampaign();
  const gentle = C.targetFor(campaign, 'willowbrook', 24);
  const brutal = C.targetFor(campaign, 'cranmoor', 24);
  assert.ok(brutal < gentle,
    `Cranmoor asked ${brutal} where Willowbrook asked ${gentle} — par is not calibrating`);
});

// The load-bearing invariant: no round may ask for more profit than the best
// reference router can actually clear there. Walks all 625.
test('no round asks for more than it can give', { timeout: 180_000 }, () => {
  const campaign = C.newCampaign();
  let checked = 0;
  for (const town of C.TOWNS) {
    for (let i = 0; i < C.ROUNDS_PER_TOWN; i++) {
      const target = C.targetFor(campaign, town.id, i);
      const par = S.parProfit(C.runConfigFor(town.id, i));
      assert.ok(target > 0, `${town.id}:${i} target was ${target}`);
      assert.ok(target <= Math.round(par) + 1,
        `${town.id}:${i} asks ${target} but par is ${Math.round(par)}`);
      checked += 1;
    }
  }
  assert.equal(checked, 625);
});

test('the ask climbs round by round, with no step at a tier boundary', () => {
  // A flat share of par per tier put a wall at each boundary and could not
  // tell two rounds apart when one was far harder to play badly on.
  const asks = [];
  for (let i = 0; i < C.ROUNDS_PER_TOWN; i++) asks.push(C.askFor(i));
  for (let i = 1; i < asks.length; i++) {
    assert.ok(asks[i] > asks[i - 1], `round ${i + 1} asks ${asks[i]} against ${asks[i - 1]}`);
    assert.ok(asks[i] - asks[i - 1] < 0.06, `round ${i + 1} jumps in one step`);
  }
  assert.ok(asks[0] < 0.35, 'the first round of a town should be an on-ramp');
  assert.ok(asks[asks.length - 1] > 0.9,
    'the last round of a town should ask for better than almost any ordinary season');
});

test('a round is measured against ordinary play on that same round', () => {
  const config = C.runConfigFor('oakridge', 4);
  const spread = S.plainSpread(config);
  assert.equal(spread.length, S.PLAIN_SAMPLES);
  for (let i = 1; i < spread.length; i++) assert.ok(spread[i] >= spread[i - 1], 'sorted');
  assert.ok(spread[spread.length - 1] > spread[0], 'plain play should vary');
  assert.ok(spread[spread.length - 1] <= S.parProfit(config) + 1,
    'nobody playing plainly should beat the whole reference family');

  // The same round always gives the same bar.
  assert.deepEqual(S.plainSpread(config), spread);
  assert.equal(C.targetFor(C.newCampaign(), 'oakridge', 4),
               C.targetFor(C.newCampaign(), 'oakridge', 4));
});

test('the early rounds are beatable by ordinary play, the late ones are not', () => {
  const campaign = C.newCampaign();
  for (const townId of ['willowbrook', 'northgate']) {
    const first = C.targetFor(campaign, townId, 0);
    const last = C.targetFor(campaign, townId, C.ROUNDS_PER_TOWN - 1);
    const beats = (i, target) => S.plainSpread(C.runConfigFor(townId, i))
      .filter((p) => p >= target).length;

    assert.ok(beats(0, first) >= S.PLAIN_SAMPLES * 0.5,
      `${townId} round 1 was cleared by ${beats(0, first)} of ${S.PLAIN_SAMPLES} plain seasons`);
    // The bar sits at the top of the spread, so a couple of the best ordinary
    // seasons reach it and nothing else does.
    assert.ok(beats(C.ROUNDS_PER_TOWN - 1, last) <= 3,
      `${townId} round 25 was cleared by ${beats(C.ROUNDS_PER_TOWN - 1, last)} of ${S.PLAIN_SAMPLES} plain seasons`);
    assert.ok(beats(C.ROUNDS_PER_TOWN - 1, last) < beats(0, first) / 3,
      `${townId} round 25 is not much harder than round 1`);
  }
});
