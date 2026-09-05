import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../js/ops.js';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';

const TOWN = 'willowbrook';

/** A career with one town fully held and the firm unlocked. */
function firm(treasury = 20_000) {
  const campaign = C.newCampaign();
  campaign.held[TOWN] = [...Array(C.ROUNDS_PER_TOWN).keys()];
  campaign.ops = O.newOps();
  campaign.treasury = treasury;
  return campaign;
}

test('buying by the pallet gets cheaper, never dearer', () => {
  assert.equal(O.bulkDiscount(0), 1);
  assert.ok(O.bulkDiscount(600) < 1);
  assert.ok(O.bulkDiscount(2000) < O.bulkDiscount(600));
  assert.ok(O.bulkDiscount(5000) < O.bulkDiscount(2000));
  const unit = (n) => O.wholesaleCost('fuel', n) / n;
  assert.ok(unit(5000) < unit(100));
});

test('a yard costs money, and only one per town', () => {
  const campaign = firm();
  const before = campaign.treasury;
  assert.equal(O.openYard(campaign, TOWN).ok, true);
  assert.equal(campaign.treasury, before - O.YARD_COST);
  assert.equal(O.hasYard(campaign.ops, TOWN), true);
  assert.equal(O.openYard(campaign, TOWN).ok, false);
});

test('nothing can be bought beyond the bank', () => {
  const campaign = firm(10);
  assert.equal(O.openYard(campaign, TOWN).ok, false);
  campaign.treasury = O.YARD_COST;
  assert.equal(O.openYard(campaign, TOWN).ok, true);
  assert.equal(O.upgradeYard(campaign, TOWN).ok, false);
  assert.equal(O.buySupplies(campaign, TOWN, { fuel: 1000, blades: 0 }).ok, false);
  assert.equal(O.hireCrew(campaign, TOWN, 0).ok, false);
});

test('a yard will not hold more than it has room for', () => {
  const campaign = firm(50_000);
  O.openYard(campaign, TOWN);
  const yard = campaign.ops.yards[TOWN];
  assert.equal(O.buySupplies(campaign, TOWN, { fuel: yard.capacity + 1, blades: 0 }).ok, false);
  assert.equal(O.buySupplies(campaign, TOWN, { fuel: yard.capacity, blades: 0 }).ok, true);
  assert.equal(O.spaceLeft(yard), 0);
  assert.equal(O.buySupplies(campaign, TOWN, { fuel: 0, blades: 1 }).ok, false);

  O.upgradeYard(campaign, TOWN);
  assert.equal(O.spaceLeft(yard), O.CAPACITY_UPGRADE_STEP);
});

test('an order of nothing is refused', () => {
  const campaign = firm();
  O.openYard(campaign, TOWN);
  assert.equal(O.buySupplies(campaign, TOWN, { fuel: 0, blades: 0 }).ok, false);
});

test('crews can only go on rounds you actually hold', () => {
  const campaign = firm();
  assert.equal(O.hireCrew(campaign, 'cranmoor', 0).ok, false);
  assert.equal(O.hireCrew(campaign, TOWN, 0).ok, true);
  assert.equal(O.hireCrew(campaign, TOWN, 0).ok, false, 'crewed twice');
  assert.equal(O.isStaffed(campaign.ops, TOWN, 0), true);
  assert.equal(O.layOffCrew(campaign, TOWN, 0).ok, true);
  assert.equal(O.isStaffed(campaign.ops, TOWN, 0), false);
  assert.equal(O.layOffCrew(campaign, TOWN, 0).ok, false);
});

test('a supplied firm cuts grass, draws down stock and turns a profit', () => {
  const campaign = firm();
  O.openYard(campaign, TOWN);
  O.buySupplies(campaign, TOWN, { fuel: 2500, blades: 400 });
  for (let i = 0; i < 6; i++) assert.equal(O.hireCrew(campaign, TOWN, i).ok, true);

  const stockBefore = O.stockTotal(campaign.ops.yards[TOWN]);
  const before = campaign.treasury;
  const summary = O.runFirmDays(campaign, 14);

  assert.equal(summary.days, 14);
  assert.ok(summary.lawns > 0, 'a crewed firm cut nothing');
  assert.ok(O.stockTotal(campaign.ops.yards[TOWN]) < stockBefore);
  assert.deepEqual(summary.dry, []);
  assert.equal(summary.net, Math.round((summary.takings - summary.costs) * 100) / 100);
  assert.ok(campaign.treasury > before, 'a supplied firm should pay for itself');
  assert.equal(campaign.ops.ledger[0].day, 14);
});

test('a yard that runs dry still owes every wage', () => {
  const campaign = firm();
  O.openYard(campaign, TOWN);
  for (let i = 0; i < 6; i++) O.hireCrew(campaign, TOWN, i);   // no supplies bought

  const before = campaign.treasury;
  const summary = O.runFirmDays(campaign, 14);
  assert.deepEqual(summary.dry, [TOWN]);
  assert.ok(summary.costs > 0, 'idle crews should still be paid');
  assert.ok(summary.lawns > 0, 'an unsupplied crew still cuts something');
  assert.ok(campaign.treasury < before);
  assert.ok(campaign.ops.alerts.some((a) => /yard/i.test(a)));
});

test('a losing day is called out, so the bank cannot quietly drain', () => {
  const campaign = firm();
  O.openYard(campaign, TOWN);
  for (let i = 0; i < 8; i++) O.hireCrew(campaign, TOWN, i);
  const summary = O.runFirmDays(campaign, 30);
  assert.ok(summary.net < 0);
  assert.ok(campaign.ops.alerts.some((a) => /lost/i.test(a)), campaign.ops.alerts.join(' | '));
});

test('an unsupplied crew earns less than a supplied one, but is never idle', () => {
  const dry = firm();
  O.openYard(dry, TOWN);
  O.hireCrew(dry, TOWN, 0);
  const dryRun = O.runFirmDays(dry, 10);

  const wet = firm();
  O.openYard(wet, TOWN);
  O.buySupplies(wet, TOWN, { fuel: 2000, blades: 300 });
  O.hireCrew(wet, TOWN, 0);
  const wetRun = O.runFirmDays(wet, 10);

  assert.ok(dryRun.lawns > 0);
  assert.ok(wetRun.lawns > dryRun.lawns, 'supplies should matter');
  assert.ok(wetRun.takings > dryRun.takings);
});

test('a yard can be closed, but only once its crews are off the books', () => {
  const campaign = firm();
  O.openYard(campaign, TOWN);
  O.hireCrew(campaign, TOWN, 0);
  assert.equal(O.closeYard(campaign, TOWN).ok, false, 'closing under a crew should be refused');

  O.layOffCrew(campaign, TOWN, 0);
  assert.equal(O.closeYard(campaign, TOWN).ok, true);
  assert.equal(O.hasYard(campaign.ops, TOWN), false);
  // Closing is the brake: nothing is owed any more.
  assert.equal(O.runFirmDays(campaign, 10).costs, 0);
  assert.equal(O.closeYard(campaign, TOWN).ok, false);
});

test('an empty firm does nothing at all', () => {
  const campaign = firm();
  const before = campaign.treasury;
  const summary = O.runFirmDays(campaign, 5);
  assert.equal(summary.lawns, 0);
  assert.equal(summary.costs, 0);
  assert.equal(campaign.treasury, before);
  assert.equal(O.runFirmDays(campaign, 0), null);
});

test('the outlook matches what a day actually does', () => {
  const campaign = firm();
  O.openYard(campaign, TOWN);
  O.buySupplies(campaign, TOWN, { fuel: 2000, blades: 300 });
  for (let i = 0; i < 5; i++) O.hireCrew(campaign, TOWN, i);

  const outlook = O.networkOutlook(campaign);
  const summary = O.runFirmDays(campaign, 1);
  assert.equal(outlook.crews, 5);
  assert.equal(outlook.lawns, summary.lawns);
  assert.ok(Math.abs(outlook.net - summary.net) < 0.02);
});

test('daylight is never stocked — a yard holds fuel and blades, nothing else', () => {
  const campaign = firm();
  O.openYard(campaign, TOWN);
  const yard = campaign.ops.yards[TOWN];
  assert.deepEqual(Object.keys(yard.stock).sort(), ['blades', 'fuel']);
  const outlook = O.roundOutlook(TOWN, 0);
  assert.ok(outlook.fuel > 0 && outlook.blades > 0);
  assert.ok(outlook.jobs > outlook.jobsDry, 'a dry yard should cost output, not hours');
});

test('a bigger round takes a crew longer, so it cuts fewer lawns', () => {
  // Pinehurst is estates; Fairhaven is handkerchiefs.
  const estates = O.roundOutlook('pinehurst', 0);
  const terraces = O.roundOutlook('fairhaven', 0);
  assert.ok(estates.jobs < terraces.jobs, 'big gardens should mean fewer of them');
});

test('the outlook does not drift away from the game it is meant to average', () => {
  // roundOutlook models an average day in closed form rather than simulating
  // one, and nothing kept the two in step. They had come apart badly: it
  // assumed a 34-unit hop between stops where the game plays out at 17, and
  // took no account of weather at all. This is the guard that says so.
  const policy = { mode: 'loop', careMode: 'standard', careMargin: 0.15, sharpenAt: 0.75,
                   takeOffers: true, rescueAt: 0, urgency: 0, rateWeight: 0 };
  const DAYS = 6;   // before attrition starts shrinking the book

  const ratios = [];
  for (const [townId, index] of [['willowbrook', 9], ['fairhaven', 9], ['millbrook', 9],
                                 ['sandmere', 16], ['cranmoor', 9]]) {
    const run = S.newRun({ ...C.runConfigFor(townId, index), target: null });
    let lawns = 0, days = 0;
    while (run.phase !== 'gameover' && days < DAYS) {
      if (run.today.offer) S.acceptOffer(run);
      run.sharpenToday = run.sharpness < policy.sharpenAt;
      const plan = S.referencePlan(run, policy);
      run.route = plan.route;
      run.care = [...plan.care];
      const result = S.simulateDay(run);
      lawns += result.jobs.filter((j) => j.due).length;
      days += 1;
      S.commitDay(run, result);
    }
    const byHand = lawns / days;
    const crew = O.roundOutlook(townId, index).jobs;
    const ratio = crew / (byHand * O.CREW_EFFECT);
    assert.ok(ratio > 0.5 && ratio < 2.3,
      `${townId}:${index} — a crew is modelled at ${crew.toFixed(2)} lawns a day ` +
      `against ${byHand.toFixed(2)} by hand (${ratio.toFixed(2)}x CREW_EFFECT)`);
    ratios.push(ratio);
  }

  // Loose per round, because a round of estates rounds badly when one lawn is
  // most of a day. Tight on average, because that is where drift shows.
  const mean = ratios.reduce((n, r) => n + r, 0) / ratios.length;
  assert.ok(mean > 0.75 && mean < 1.5,
    `the firm is modelled at ${mean.toFixed(2)}x what a person manages, times CREW_EFFECT`);
});

test('a crew is worth stationing on some rounds and not others', () => {
  // If every round paid, the firm would be a button rather than a decision.
  const nets = [];
  for (const town of C.TOWNS) {
    for (let i = 0; i < C.ROUNDS_PER_TOWN; i++) {
      const o = O.roundOutlook(town.id, i);
      nets.push(o.takings - o.wage);
    }
  }
  const paying = nets.filter((n) => n > 0).length;
  assert.ok(paying > nets.length * 0.2 && paying < nets.length * 0.8,
    `${paying} of ${nets.length} rounds pay a crew — the choice has gone one way or the other`);
  assert.ok(Math.max(...nets) > 40, 'the best rounds should be clearly worth crewing');
  assert.ok(Math.min(...nets) < -20, 'the worst rounds should be clearly not');
});
