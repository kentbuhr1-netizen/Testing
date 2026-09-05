import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';

test('the country is 25 towns of 25 books', () => {
  assert.equal(C.TOWNS.length, 25);
  assert.equal(C.TIER_LAYOUT.length, C.BOOKS_PER_TOWN);
  for (const town of C.TOWNS) assert.equal(C.booksFor(town.id).length, 25, town.id);
});

test('every town has a unique id, a challenge and somewhere to put a book', () => {
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
    assert.ok(C.TIERS[order[i]].parFactor > C.TIERS[order[i - 1]].parFactor, order[i]);
    assert.ok(C.TIERS[order[i]].stake <= C.TIERS[order[i - 1]].stake, order[i]);
    assert.ok(C.TIERS[order[i]].weeks >= C.TIERS[order[i - 1]].weeks, order[i]);
  }
});

test('books generate the same way every time, with distinct names', () => {
  for (const townId of ['marlowgreen', 'cadwell', 'kirkwald']) {
    assert.deepEqual(C.booksFor(townId), C.booksFor(townId));
    const names = C.booksFor(townId).map((b) => b.name);
    assert.equal(new Set(names).size, names.length, `${townId} has duplicate names`);
  }
});

test('every modifier on this book multiplies', () => {
  const merged = C.mergeMods({ risk: 1.5, noise: 2 }, { risk: 2 });
  assert.equal(merged.risk, 3);
  assert.equal(merged.noise, 2);
});

test('towns open two at a time', () => {
  const campaign = C.newCampaign();
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[0].id), true);
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[1].id), true);
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[2].id), false);

  campaign.held[C.TOWNS[0].id] = [...Array(C.BOOKS_PER_TOWN).keys()];
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[2].id), true);
  assert.equal(C.isTownUnlocked(campaign, C.TOWNS[3].id), false);
});

test('books unlock one at a time, in order', () => {
  const campaign = C.newCampaign();
  const id = C.TOWNS[0].id;
  assert.equal(C.isBookUnlocked(campaign, id, 0), true);
  assert.equal(C.isBookUnlocked(campaign, id, 1), false);
  C.holdBook(campaign, id, 0, 100, 12);
  assert.equal(C.isBookUnlocked(campaign, id, 1), true);
  assert.equal(C.isBookUnlocked(campaign, id, 2), false);
  assert.equal(C.nextBook(campaign, id), 1);
});

test('holding a book banks the profit and counts the loans', () => {
  const campaign = C.newCampaign();
  C.holdBook(campaign, C.TOWNS[0].id, 0, 250.5, 40);
  assert.equal(campaign.treasury, 250.5);
  assert.equal(campaign.stats.loansWritten, 40);
});

test('the network unlocks on the fifth completed town', () => {
  const campaign = C.newCampaign();
  let result;
  for (let t = 0; t < C.TOWNS_FOR_OPS; t++) {
    const id = C.TOWNS[t].id;
    for (let i = 0; i < C.BOOKS_PER_TOWN; i++) result = C.holdBook(campaign, id, i, 10, 1);
    assert.equal(C.townDone(campaign, id), true);
  }
  assert.equal(C.opsUnlocked(campaign), true);
  assert.equal(result.opsJustUnlocked, true);
  assert.equal(C.campaignProgress(campaign).towns, C.TOWNS_FOR_OPS);
});

test('a locked town hides its books too', () => {
  const campaign = C.newCampaign();
  const far = C.TOWNS[20].id;
  assert.equal(C.isTownUnlocked(campaign, far), false);
  assert.equal(C.isBookUnlocked(campaign, far, 0), false);
});

test('the free tier is the first towns, positionally', () => {
  assert.equal(C.isTownFree(C.TOWNS[0].id, 3), true);
  assert.equal(C.isTownFree(C.TOWNS[2].id, 3), true);
  assert.equal(C.isTownFree(C.TOWNS[3].id, 3), false);
  assert.equal(C.isTownFree(C.TOWNS[24].id, C.TOWNS.length), true);
});

test('every book explains itself before you take it on', () => {
  for (const town of C.TOWNS) {
    const config = C.runConfigFor(town.id, 12);
    assert.ok(config.weeks > 0 && config.stake > 0, town.id);
    for (const note of C.describeMods(config.mods)) {
      assert.ok(note.icon && note.text, town.id);
    }
  }
  // A town that bends a rule hard should say so.
  assert.ok(C.describeMods(C.runConfigFor('ravensmere', 0).mods).some((n) => /files tell you/i.test(n.text)));
  assert.ok(C.describeMods(C.runConfigFor('crowmoor', 0).mods).some((n) => /nervous|restless/i.test(n.text)));
  assert.ok(C.describeMods(C.runConfigFor('ironbridge', 0).mods).some((n) => /large sums/i.test(n.text)));
});

test('a cached target never moves under the player', () => {
  const campaign = C.newCampaign();
  const first = C.targetFor(campaign, 'marlowgreen', 3);
  campaign.targets['marlowgreen:3'] = first + 999;
  assert.equal(C.targetFor(campaign, 'marlowgreen', 3), first + 999);
});

/**
 * Note on what "harder" means here, because it is not what it was in the
 * other games: a risky town charges higher rates, so the best possible play
 * there can clear *more* than in a sleepy one. A hard town is hard to read,
 * not short of money. So the honest calibration test is that par falls when
 * the things the player actually relies on are taken away.
 */
test('par falls when the files stop telling you anything', () => {
  let clear = 0;
  let fog = 0;
  for (let i = 0; i < 6; i++) {
    const config = { seed: 8000 + i * 7919, weeks: 18 };
    clear += S.parProfit({ ...config, mods: { noise: 0.7 } });
    fog += S.parProfit({ ...config, mods: { noise: 2.0 } });
  }
  assert.ok(fog < clear,
    `unreadable files cleared ${fog / 6} against ${clear / 6} for legible ones`);
});

test('par falls when the branch costs more to keep open', () => {
  let cheap = 0;
  let dear = 0;
  for (let i = 0; i < 6; i++) {
    const config = { seed: 8100 + i * 7919, weeks: 18 };
    cheap += S.parProfit({ ...config, mods: {} });
    dear += S.parProfit({ ...config, mods: { overhead: 3 } });
  }
  assert.ok(dear < cheap, `a dear branch cleared ${dear / 6} against ${cheap / 6}`);
});

test('the tier a book sits in decides how much of par it asks for', () => {
  const campaign = C.newCampaign();
  // Same town, same quirk-free comparison: the ratio of target to par is the
  // tier's parFactor, whatever the book itself turns out to be worth.
  for (const [index, tier] of [[0, 'easy'], [7, 'medium'], [14, 'hard'], [24, 'impossible']]) {
    const par = S.parProfit(C.runConfigFor('marlowgreen', index));
    const target = C.targetFor(campaign, 'marlowgreen', index);
    const share = target / par;
    assert.ok(Math.abs(share - C.TIERS[tier].parFactor) < 0.02,
      `${tier} book asked ${share.toFixed(3)} of par, expected ${C.TIERS[tier].parFactor}`);
  }
});

test('every book is deterministic end to end, target included', () => {
  const a = C.newCampaign();
  const b = C.newCampaign();
  for (const [town, i] of [['saltcoats', 7], ['cadwell', 18], ['kirkwald', 24]]) {
    assert.equal(C.targetFor(a, town, i), C.targetFor(b, town, i), `${town}:${i}`);
    assert.deepEqual(C.runConfigFor(town, i), C.runConfigFor(town, i));
  }
});

// The load-bearing invariant: no book may ask for more profit than the best
// reference underwriter can actually clear there. Walks all 625.
test('no book asks for more than it can give', { timeout: 300_000 }, () => {
  const campaign = C.newCampaign();
  let checked = 0;
  for (const town of C.TOWNS) {
    for (let i = 0; i < C.BOOKS_PER_TOWN; i++) {
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
