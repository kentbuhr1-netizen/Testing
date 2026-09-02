import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../js/ops.js';
import * as C from '../js/campaign.js';
import * as S from '../js/sim.js';

const REGION = 'wellington';

/** A campaign with one region fully held and the agency unlocked. */
function agencyCampaign(treasury = 1000) {
  const campaign = C.newCampaign();
  campaign.held[REGION] = [...Array(C.DISTRICTS_PER_REGION).keys()];
  campaign.ops = O.newOps();
  campaign.treasury = treasury;
  return campaign;
}

test('bulk procurement gets cheaper by the crate, never dearer', () => {
  assert.equal(O.bulkDiscount(0), 1);
  assert.ok(O.bulkDiscount(250_000) < 1);
  assert.ok(O.bulkDiscount(600_000) < O.bulkDiscount(250_000));
  assert.ok(O.bulkDiscount(2_000_000) < O.bulkDiscount(600_000));

  // Per dose, a bigger order is never worse value.
  const unit = (n) => O.wholesaleCost(n) / n;
  assert.ok(unit(1_000_000) < unit(100_000));
});

test('a laboratory costs budget, and only one per region', () => {
  const campaign = agencyCampaign();
  const before = campaign.treasury;
  assert.equal(O.buildLab(campaign, REGION).ok, true);
  assert.equal(campaign.treasury, before - O.LAB_COST);
  assert.equal(O.hasLab(campaign.ops, REGION), true);
  assert.equal(O.buildLab(campaign, REGION).ok, false);
});

test('you cannot build, upgrade or buy beyond the budget', () => {
  const campaign = agencyCampaign(10);
  assert.equal(O.buildLab(campaign, REGION).ok, false);
  campaign.treasury = O.LAB_COST;
  assert.equal(O.buildLab(campaign, REGION).ok, true);
  assert.equal(O.upgradeLab(campaign, REGION).ok, false);
  assert.equal(O.buyDoses(campaign, REGION, 100_000).ok, false);
});

test('a laboratory will not hold more doses than it has room for', () => {
  const campaign = agencyCampaign(5000);
  O.buildLab(campaign, REGION);
  const lab = campaign.ops.labs[REGION];
  assert.equal(O.buyDoses(campaign, REGION, lab.capacity + 1).ok, false);
  assert.equal(O.buyDoses(campaign, REGION, lab.capacity).ok, true);
  assert.equal(O.spaceLeft(lab), 0);

  O.upgradeLab(campaign, REGION);
  assert.equal(O.spaceLeft(lab), O.CAPACITY_UPGRADE_STEP);
});

test('teams can only be stationed on districts you actually hold', () => {
  const campaign = agencyCampaign();
  assert.equal(O.stationTeam(campaign, 'miami', 0).ok, false);
  assert.equal(O.stationTeam(campaign, REGION, 0).ok, true);
  assert.equal(O.stationTeam(campaign, REGION, 0).ok, false, 'staffed twice');
  assert.equal(O.isStaffed(campaign.ops, REGION, 0), true);
  assert.equal(O.standDownTeam(campaign, REGION, 0).ok, true);
  assert.equal(O.isStaffed(campaign.ops, REGION, 0), false);
});

test('a supplied network saves lives, draws down doses and turns a profit', () => {
  const campaign = agencyCampaign();
  O.buildLab(campaign, REGION);
  O.buyDoses(campaign, REGION, 300_000);
  for (let i = 0; i < 6; i++) O.stationTeam(campaign, REGION, i);

  const dosesBefore = campaign.ops.labs[REGION].doses;
  const before = campaign.treasury;
  const summary = O.runAgencyWeeks(campaign, 4);

  assert.equal(summary.weeks, 4);
  assert.ok(summary.saved > 0, 'a staffed network saved nobody');
  assert.ok(summary.doses > 0 && campaign.ops.labs[REGION].doses < dosesBefore);
  assert.deepEqual(summary.dry, []);
  assert.equal(summary.net, Math.round((summary.grants - summary.costs) * 100) / 100);
  assert.ok(campaign.treasury > before, 'a supplied network should pay for itself');
  assert.equal(campaign.ops.ledger[0].week, 4);
});

test('a laboratory that runs dry still owes every wage', () => {
  const campaign = agencyCampaign();
  O.buildLab(campaign, REGION);
  for (let i = 0; i < 6; i++) O.stationTeam(campaign, REGION, i);   // no doses bought

  const before = campaign.treasury;
  const summary = O.runAgencyWeeks(campaign, 4);
  assert.deepEqual(summary.dry, [REGION]);
  assert.ok(summary.costs > 0, 'idle teams should still be paid');
  assert.ok(summary.net < 0, 'an unsupplied payroll should cost money');
  assert.ok(campaign.treasury < before);
  assert.ok(campaign.ops.alerts.length > 0, 'nobody was told the lab was empty');
});

test('an unsupplied team saves less than a supplied one, but is never useless', () => {
  const dry = agencyCampaign();
  O.buildLab(dry, REGION);
  O.stationTeam(dry, REGION, 0);
  const dryRun = O.runAgencyWeeks(dry, 4);

  const wet = agencyCampaign();
  O.buildLab(wet, REGION);
  O.buyDoses(wet, REGION, 300_000);
  O.stationTeam(wet, REGION, 0);
  const wetRun = O.runAgencyWeeks(wet, 4);

  assert.ok(dryRun.saved > 0);
  assert.ok(wetRun.saved > dryRun.saved, 'doses should matter');
});

test('an empty network does nothing at all', () => {
  const campaign = agencyCampaign();
  const before = campaign.treasury;
  const summary = O.runAgencyWeeks(campaign, 5);
  assert.equal(summary.saved, 0);
  assert.equal(summary.costs, 0);
  assert.equal(campaign.treasury, before);
  assert.equal(O.runAgencyWeeks(campaign, 0), null);
});

test('the outlook matches what a week actually does', () => {
  const campaign = agencyCampaign();
  O.buildLab(campaign, REGION);
  O.buyDoses(campaign, REGION, 300_000);
  for (let i = 0; i < 5; i++) O.stationTeam(campaign, REGION, i);

  const outlook = O.networkOutlook(campaign);
  const summary = O.runAgencyWeeks(campaign, 1);
  assert.equal(outlook.teams, 5);
  assert.equal(outlook.saved, summary.saved);
  assert.equal(outlook.doses, summary.doses);
  assert.ok(Math.abs(outlook.net - summary.net) < 0.02);
});

test('beds are never stockpiled — teams pay for theirs locally, every week', () => {
  const outlook = O.districtOutlook(REGION, 0);
  assert.ok(outlook.beds > 0, 'a team should be paying for beds');
  assert.ok(outlook.doses > 0);
  const lab = { capacity: O.LAB_BASE_CAPACITY, doses: 0 };
  assert.equal(Object.keys(lab).includes('beds'), false, 'a laboratory should not stock beds');
});

/**
 * The agency has to obey the same rule the rest of the game does: what a thing
 * is worth is measured, not asserted. A team used to be worth a flat share of
 * a district's population, which meant a team standing over a mild flu in a
 * young city was worth as much as one standing over Cascade in an old one, and
 * every team everywhere paid for itself.
 */
test('what a team is worth is measured from the district it stands over', () => {
  const sampled = [];
  for (const region of C.REGIONS) {
    for (let i = 0; i < C.DISTRICTS_PER_REGION; i += 6) {
      const o = O.districtOutlook(region.id, i);
      const config = C.runConfigFor(region.id, i);
      const dyingPerWeek = S.baselineDeaths(config) / config.weeks;

      assert.ok(o.saved >= 0, `${region.id}:${i} saved ${o.saved}`);
      assert.ok(o.saved <= dyingPerWeek + 1e-9,
        `${region.id}:${i} saves ${o.saved} of ${dyingPerWeek} dying — a team cannot save more than die`);
      assert.ok(o.savedDry < o.saved || o.saved === 0,
        `${region.id}:${i} an unsupplied team should achieve less`);
      sampled.push(o.saved / o.pop);
    }
  }

  // Per head, districts must differ substantially — a figure driven by
  // population alone would barely move.
  const lo = Math.min(...sampled);
  const hi = Math.max(...sampled);
  assert.ok(hi > lo * 10, `per-head worth barely varies: ${lo} to ${hi}`);
});

test('not every district is worth stationing a team on', () => {
  let worthIt = 0, notWorthIt = 0;
  for (const region of C.REGIONS) {
    for (let i = 0; i < C.DISTRICTS_PER_REGION; i += 3) {
      const o = O.districtOutlook(region.id, i);
      if (o.grant > o.wage + o.beds) worthIt += 1; else notWorthIt += 1;
    }
  }
  assert.ok(worthIt > 0, 'no district anywhere pays for a team');
  assert.ok(notWorthIt > 0, 'every district pays for a team — stationing is not a decision');
});
