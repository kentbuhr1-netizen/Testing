import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';

const CFG = { seed: 4242, days: 18 };

const workDay = (state, route, sharpen = false) => {
  state.route = route;
  state.sharpenToday = sharpen;
  const result = S.simulateDay(state);
  S.commitDay(state, result);
  return result;
};

const active = (s) => s.properties.filter((p) => p.active);

/**
 * Force a full, dry working day.
 *
 * Weather is rolled from the seed, and a downpour can leave 144 workable
 * minutes — not enough for one overgrown lawn. That is correct behaviour, but
 * it is not what these tests are about, so they pin the day open.
 */
const fullDay = (state) => {
  state.today = { ...state.today, workable: S.WORK_MINUTES, wet: false };
  return state;
};

test('the same seed replays the same season', () => {
  const a = S.newRun(CFG);
  const b = S.newRun(CFG);
  for (let d = 0; d < 6; d++) {
    workDay(a, active(a).slice(0, 4).map((p) => p.id));
    workDay(b, active(b).slice(0, 4).map((p) => p.id));
  }
  assert.equal(a.money, b.money);
  assert.deepEqual(a.properties.map((p) => p.patience), b.properties.map((p) => p.patience));
});

test('a round has clients, positions and a hidden standard', () => {
  const s = S.newRun(CFG);
  assert.ok(s.properties.length >= 6, `only ${s.properties.length} clients`);
  for (const p of s.properties) {
    assert.ok(p.x >= 0 && p.x <= S.MAP_SIZE && p.y >= 0 && p.y <= S.MAP_SIZE, p.name);
    assert.ok(p.size > 0 && p.rate > 0, p.name);
    assert.ok(p.expectedGap >= 5 && p.expectedGap <= 12, p.name);
    assert.ok(p.fussiness > 0, p.name);
  }
  assert.equal(new Set(s.properties.map((p) => p.name)).size, s.properties.length);
});

test('a visit only pays once the grass has actually grown', () => {
  const s = fullDay(S.newRun(CFG));
  const id = s.properties[0].id;
  s.properties[0].height = 20;
  const first = workDay(s, [id]);
  assert.equal(first.jobs[0].due, true);
  assert.ok(first.earned > 0);

  // Straight back the next morning: nothing to cut, nothing to bill.
  fullDay(s);
  const again = workDay(s, [id]);
  assert.equal(again.jobs[0].due, false);
  assert.equal(again.earned, 0);
  assert.ok(again.jobs[0].delta < 0, 'a wasted visit should mildly annoy them');
});

test('long grass takes longer to cut than short grass', () => {
  const s = S.newRun(CFG);
  const p = s.properties[0];
  p.height = 5;
  const quick = S.mowMinutes(p, s);
  p.height = 25;
  const slow = S.mowMinutes(p, s);
  assert.ok(slow > quick * 1.3, `${quick} → ${slow}`);
});

test('a blunt blade mows slower and finishes worse', () => {
  const sharp = S.newRun(CFG);
  const blunt = S.newRun(CFG);
  blunt.sharpness = 0.15;
  const p = sharp.properties[0];
  assert.ok(S.mowMinutes(p, blunt) > S.mowMinutes(p, sharp));
  assert.ok(S.cutQuality(p, blunt) < S.cutQuality(p, sharp) - 0.2);
});

test('wet grass is slower and cuts worse', () => {
  const dry = S.newRun(CFG);
  const wet = S.newRun(CFG);
  dry.today = { ...dry.today, wet: false };
  wet.today = { ...wet.today, wet: true };
  const p = dry.properties[0];
  assert.ok(S.mowMinutes(p, wet) > S.mowMinutes(p, dry));
  assert.ok(S.cutQuality(p, wet) < S.cutQuality(p, dry));
});

test('mowing dulls the blade, and sharpening costs time and money', () => {
  const s = fullDay(S.newRun(CFG));
  for (const p of s.properties) p.height = 12;   // give it something to cut
  const before = s.sharpness;
  const worked = workDay(s, active(s).slice(0, 3).map((p) => p.id));
  assert.ok(worked.jobs.length > 0, 'this test needs a day where something got cut');
  assert.ok(s.sharpness < before, 'the blade should go off as you mow');

  const money = s.money;
  const result = workDay(fullDay(s), [], true);
  assert.equal(s.sharpness, 1, 'sharpening should restore the blade');
  assert.equal(round2(money - s.money), S.SHARPEN_COST);
  assert.ok(result.minutes >= S.SHARPEN_MINUTES);
});

const round2 = (n) => Math.round(n * 100) / 100;

test('the day runs out, and the van always has time to get home', () => {
  const s = fullDay(S.newRun(CFG));
  const everything = active(s).map((p) => p.id);
  const plan = S.planRoute(s, everything);
  assert.ok(plan.doable.length < everything.length, 'this test needs an over-full day');
  assert.ok(plan.minutes <= s.today.workable + 0.01,
    `plan ran to ${plan.minutes} of ${s.today.workable}`);

  const result = workDay(s, everything);
  assert.equal(result.jobs.length, plan.doable.length);
  assert.ok(result.skipped > 0);
});

test('the order of a route changes how much of it fits', () => {
  const s = fullDay(S.newRun({ ...CFG, seed: 90210 }));
  for (const p of s.properties) p.height = 10;
  const ids = active(s).map((p) => p.id);
  const far = [...ids].sort((a, b) =>
    S.distance(s.properties[b], S.DEPOT) - S.distance(s.properties[a], S.DEPOT));
  const near = [...far].reverse();
  const farFirst = S.planRoute(s, far);
  const nearFirst = S.planRoute(s, near);
  assert.notEqual(farFirst.doable.length, nearFirst.doable.length,
    'routing should change the day, or the game has no point');
});

test('a good cut builds patience and a bad one burns it faster', () => {
  const good = fullDay(S.newRun(CFG));
  const bad = fullDay(S.newRun(CFG));
  bad.sharpness = 0.15;
  for (const s of [good, bad]) {
    s.properties[0].height = 12;
    s.properties[0].fussiness = 1.0;
  }
  const g = workDay(good, [0]);
  const b = workDay(bad, [0]);
  assert.ok(g.jobs[0].delta > b.jobs[0].delta, 'a better cut should be received better');
  assert.ok(b.jobs[0].delta < 0, 'a poor finish should cost patience');
});

test('neglected clients lose patience and eventually cancel', () => {
  const s = S.newRun({ ...CFG, days: 40 });
  const victim = s.properties[0];
  victim.fussiness = 1.6;
  const before = victim.patience;
  // Never go near them.
  for (let d = 0; d < 30 && s.phase !== 'gameover'; d++) workDay(s, []);
  const after = s.properties[0];
  assert.ok(after.patience < before, 'ignoring somebody should cost patience');
  assert.equal(after.active, false, 'they should have cancelled by now');
  assert.ok(s.lost.some((l) => l.id === 0));
});

test('a cancelled client stays gone', () => {
  const s = S.newRun({ ...CFG, days: 40 });
  for (let d = 0; d < 30 && s.phase !== 'gameover'; d++) workDay(s, []);
  const gone = s.properties.filter((p) => !p.active).map((p) => p.id);
  assert.ok(gone.length > 0);
  const result = workDay(s, gone);          // try to service them anyway
  assert.equal(result.jobs.length, 0, 'you cannot mow for somebody who fired you');
});

test('taking on new work adds a client and pays a signing fee', () => {
  const s = S.newRun(CFG);
  let found = false;
  for (let d = 0; d < 30 && s.phase !== 'gameover'; d++) {
    if (s.today.offer) {
      const count = s.properties.length;
      const money = s.money;
      assert.equal(S.acceptOffer(s), true);
      assert.equal(s.properties.length, count + 1);
      assert.ok(s.money > money, 'a signing fee should be paid');
      assert.equal(s.today.offer, null, 'the offer should be consumed');
      found = true;
      break;
    }
    workDay(s, []);
  }
  assert.ok(found, 'no work was ever offered across a whole season');
});

test('the weather takes hours out of the day', () => {
  const seen = new Set();
  for (let seed = 0; seed < 60; seed++) {
    const s = S.newRun({ seed, days: 12 });
    seen.add(s.today.weather);
    assert.ok(s.today.workable > 0 && s.today.workable <= S.WORK_MINUTES);
  }
  assert.ok(seen.size >= 3, `only saw ${[...seen].join(', ')}`);
  assert.ok(S.WEATHER.storm.workable < S.WEATHER.clear.workable);
});

test('a season ends after exactly its days and scores on profit', () => {
  const s = S.newRun({ ...CFG, target: 1 });
  let guard = 0;
  while (s.phase !== 'gameover' && guard++ < 200) {
    workDay(s, active(s).filter(S.isDue).slice(0, 5).map((p) => p.id));
  }
  assert.ok(s.day > s.days || active(s).length === 0);
  const score = S.finalScore(s);
  assert.equal(score.net, round2(s.money - s.stake));
  assert.equal(score.won, score.net >= score.target);
  assert.equal(score.lost, s.lost.length);
});

test('the round tells you what it is unhappy about', () => {
  const s = fullDay(S.newRun(CFG));
  s.sharpness = 0.15;
  s.properties[0].height = 30;
  const result = workDay(s, [0]);
  assert.ok(result.notes.length > 0);
  assert.ok(result.notes.some((n) => /hayfield|shaggy|hurry|tearing/.test(n)),
    `notes were: ${result.notes.join(' | ')}`);
});

test('par is a real profit, and better than the worst policy', () => {
  const scores = S.POLICIES.map((p) => S.playPolicy(CFG, p));
  const par = S.parProfit(CFG);
  assert.equal(par, Math.max(...scores));
  assert.ok(par > 0, `par was ${par}`);
  assert.ok(par > Math.min(...scores), 'every policy scored the same, so nothing matters');
});

test('routing well is worth real money against working down the list', () => {
  // The headline mechanic has to pay, or the game is just a to-do list.
  for (const seed of [11, 4242, 90210]) {
    const cfg = { seed, days: 18 };
    const par = S.parProfit(cfg);
    const s = S.newRun({ ...cfg, target: null });
    while (s.phase !== 'gameover') {
      if (s.today.offer) S.acceptOffer(s);
      s.route = s.properties.filter((p) => p.active && S.isDue(p)).map((p) => p.id);
      s.sharpenToday = false;
      S.commitDay(s, S.simulateDay(s));
    }
    const listOrder = s.money - s.stake;
    assert.ok(listOrder < par * 0.9,
      `seed ${seed}: list order got ${listOrder} of par ${par} — routing is not mattering`);
  }
});

test('the reference router never plans a day it cannot finish', () => {
  const s = S.newRun(CFG);
  const policy = S.POLICIES[0];
  while (s.phase !== 'gameover') {
    s.sharpenToday = s.sharpness < policy.sharpenAt;
    s.route = S.referenceRoute(s, policy);
    const plan = S.planRoute(s, s.route);
    assert.ok(plan.fits, `day ${s.day}: the bot planned a route that does not fit`);
    assert.ok(plan.minutes <= s.today.workable + 0.01);
    S.commitDay(s, S.simulateDay(s));
  }
});

test('the reference router does not waste trips on lawns with nothing to cut', () => {
  const s = S.newRun(CFG);
  const policy = S.POLICIES[4];
  for (let d = 0; d < 8 && s.phase !== 'gameover'; d++) {
    s.route = S.referenceRoute(s, policy);
    for (const id of s.route) {
      assert.ok(S.isDue(s.properties[id]), `${s.properties[id].name} had nothing to cut`);
    }
    S.commitDay(s, S.simulateDay(s));
  }
});

/* ------------------------------------------------------------------ *
 * Taking your time, and what your name is worth
 * ------------------------------------------------------------------ */

test('taking your time costs minutes and buys a better finish', () => {
  const s = fullDay(S.newRun(CFG));
  const p = s.properties[0];
  assert.ok(S.mowMinutes(p, s, true) > S.mowMinutes(p, s, false),
    'lingering over a lawn has to cost something');
  assert.ok(S.cutQuality(p, s, true) > S.cutQuality(p, s, false),
    'and it has to show in the finish');
});

test('a sharp blade alone cannot satisfy the fussiest clients', () => {
  // If it could, a discovered standard would be a fact with nothing to do
  // about it, and the whole hidden half of the game would be decoration.
  const s = fullDay(S.newRun(CFG));
  const p = s.properties[0];
  p.height = S.IDEAL_HEIGHT;
  p.fussiness = 1.6;
  s.sharpness = 1;
  assert.ok(S.cutQuality(p, s, false) < S.qualityBar(p),
    'a perfect blade should not clear the highest standard on its own');
  assert.ok(S.cutQuality(p, s, true) >= S.qualityBar(p),
    'and taking your time should');
});

test('the extra time is planned for, and only where you asked for it', () => {
  const s = fullDay(S.newRun(CFG));
  const ids = active(s).slice(0, 3).map((p) => p.id);
  s.route = ids;
  const quick = S.planRoute(s, ids);
  s.care = [ids[1]];
  const careful = S.planRoute(s, ids);
  assert.ok(careful.minutes > quick.minutes, 'the day should get longer');
  assert.equal(careful.legs.filter((l) => l.careful).length, 1);
  assert.equal(careful.legs.find((l) => l.careful).id, ids[1]);
});

test('a poor finish reads worse the further short it falls', () => {
  // A floor that saturates makes every bad cut identical, and there is then
  // nothing in the feedback to learn from.
  const near = fullDay(S.newRun(CFG));
  const far = fullDay(S.newRun(CFG));
  for (const s of [near, far]) { s.properties[0].height = S.IDEAL_HEIGHT; }
  near.properties[0].fussiness = 1.0;
  far.properties[0].fussiness = 1.6;
  near.sharpness = far.sharpness = 0.5;
  const a = workDay(near, [0]);
  const b = workDay(far, [0]);
  assert.ok(b.jobs[0].delta < a.jobs[0].delta,
    `missing by more should hurt more: ${a.jobs[0].delta} vs ${b.jobs[0].delta}`);
});

test('they tell you when the extra time was wasted', () => {
  const s = fullDay(S.newRun(CFG));
  const p = s.properties[0];
  p.height = S.IDEAL_HEIGHT;
  p.fussiness = 0.6;          // easily pleased
  s.sharpness = 1;
  s.care = [p.id];
  const result = workDay(s, [p.id]);
  assert.match(result.jobs[0].note, /in and out/,
    `they should say the time was wasted, said: "${result.jobs[0].note}"`);
});

test('a client who walks costs you your name, on every lawn', () => {
  const s = fullDay(S.newRun(CFG));
  const victim = active(s)[0];
  victim.patience = 0.01;
  victim.expectedGap = 1;
  victim.lastCut = s.day - 40;      // long overdue, about to walk
  const before = s.standing;
  const result = workDay(s, []);
  assert.equal(result.lost.length, 1, 'this test needs somebody to walk');
  assert.ok(s.standing < before, 'losing a client should cost you standing');

  // And that comes off the takings, not just the scoreboard.
  const paid = fullDay(S.newRun(CFG));
  const cut = active(paid)[0];
  cut.height = 8;
  const full = workDay(paid, [cut.id]);
  assert.ok(Math.abs(full.jobs[0].rate - cut.rate) < 0.01,
    'a full name should be paid the full rate');
});

test('standing never falls through the floor', () => {
  const s = S.newRun(CFG);
  s.standing = S.STANDING_FLOOR;
  for (const p of s.properties) { p.patience = 0.01; p.expectedGap = 1; p.lastCut = s.day - 40; }
  const result = S.simulateDay(fullDay(s));
  assert.ok(result.lost.length > 1, 'this test needs a walkout');
  assert.ok(result.next.standing >= S.STANDING_FLOOR);
});

test('ignoring what people want does not get you through the hard rounds', () => {
  // The point of the hidden standard is that it has to cost something to
  // ignore it. This is the measurement that says so.
  const cfg = { seed: 4242, days: 22, mods: { fussiness: 1.15, dulling: 1.15 } };
  const par = S.parProfit(cfg);
  const careless = S.playPolicy(cfg,
    { mode: 'loop', careMode: 'never', sharpenAt: 0.75, takeOffers: true,
      rescueAt: 0.25, urgency: 0, rateWeight: 0 });
  assert.ok(careless < par * 0.92,
    `never taking your time got ${careless} of par ${par} — the standard is not costing anything`);
});
