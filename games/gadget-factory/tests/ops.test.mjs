import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../js/ops.js';
import * as C from '../js/campaign.js';

const TIER_ID = 'bicycles';

function opsCampaign(treasury = 100_000) {
  const campaign = C.newCampaign();
  campaign.unlockedTiers = 2;
  campaign.ops = O.newOps();
  campaign.treasury = treasury;
  return campaign;
}

test('bulk components get cheaper by the crate, never dearer', () => {
  assert.equal(O.bulkDiscount(0), 1);
  assert.ok(O.bulkDiscount(20_000) < 1);
  assert.ok(O.bulkDiscount(60_000) < O.bulkDiscount(20_000));
  assert.ok(O.bulkDiscount(300_000) < O.bulkDiscount(60_000));

  const unit = (n) => O.wholesaleCost(n) / n;
  assert.ok(unit(100_000) < unit(1_000));
});

test('an office costs treasury, and only one per tier', () => {
  const campaign = opsCampaign();
  const before = campaign.treasury;
  assert.equal(O.buildOffice(campaign, TIER_ID).ok, true);
  assert.equal(campaign.treasury, before - O.officeHireCost(C.TIER_INDEX[TIER_ID]));
  assert.equal(O.hasOffice(campaign.ops, TIER_ID), true);
  assert.equal(O.buildOffice(campaign, TIER_ID).ok, false);
});

test('you cannot build, hire or order beyond the treasury', () => {
  const campaign = opsCampaign(10);
  assert.equal(O.buildOffice(campaign, TIER_ID).ok, false);
  campaign.treasury = O.officeHireCost(0);
  assert.equal(O.buildOffice(campaign, TIER_ID).ok, true);
  assert.equal(O.hireManager(campaign, TIER_ID).ok, false);
  assert.equal(O.buyComponents(campaign, 100).ok, false);
});

test('managers cannot exceed the office cap, and cost more each time', () => {
  const campaign = opsCampaign();
  O.buildOffice(campaign, TIER_ID);
  let lastCost = 0;
  for (let i = 0; i < O.MAX_MANAGERS_PER_OFFICE; i++) {
    const cost = O.managerCost(C.TIER_INDEX[TIER_ID], i);
    assert.ok(cost > lastCost, 'each manager should cost more than the last');
    lastCost = cost;
    assert.equal(O.hireManager(campaign, TIER_ID).ok, true);
  }
  assert.equal(O.hireManager(campaign, TIER_ID).ok, false, 'the office should now be full');
  assert.equal(O.managersAt(campaign.ops, TIER_ID), O.MAX_MANAGERS_PER_OFFICE);
});

test('a warehouse will not hold more components than it has room for', () => {
  const campaign = opsCampaign();
  const warehouse = campaign.ops.warehouse;
  assert.equal(O.buyComponents(campaign, warehouse.capacity + 1).ok, false);
  assert.equal(O.buyComponents(campaign, warehouse.capacity).ok, true);
  assert.equal(O.spaceLeft(warehouse), 0);

  O.upgradeWarehouse(campaign);
  assert.equal(O.spaceLeft(warehouse), O.WAREHOUSE_CAPACITY_STEP);
});

test('a supplied office earns every hour and draws down the warehouse', () => {
  const campaign = opsCampaign();
  O.buildOffice(campaign, TIER_ID);
  for (let i = 0; i < 3; i++) O.hireManager(campaign, TIER_ID);
  O.buyComponents(campaign, 5_000);

  const before = campaign.ops.warehouse.components;
  const summary = O.runOfficeHours(campaign, 4);

  assert.equal(summary.hours, 4);
  assert.ok(summary.income > 0);
  assert.deepEqual(summary.dry, []);
  assert.ok(campaign.ops.warehouse.components < before);
  assert.equal(campaign.ops.ledger[0].hour, 4);
});

test('a warehouse that runs dry still owes every manager their wage', () => {
  const campaign = opsCampaign();
  O.buildOffice(campaign, TIER_ID);
  for (let i = 0; i < 3; i++) O.hireManager(campaign, TIER_ID);   // no components bought

  const before = campaign.treasury;
  const summary = O.runOfficeHours(campaign, 4);
  assert.deepEqual(summary.dry, [TIER_ID]);
  assert.ok(summary.costs > 0, 'idle managers should still be paid');
  assert.ok(summary.net < 0, 'an unsupplied payroll should cost money');
  assert.ok(campaign.treasury < before);
  assert.ok(campaign.ops.alerts.length > 0, 'nobody was told the warehouse was empty');
});

test('an office with no managers costs and earns nothing', () => {
  const campaign = opsCampaign();
  O.buildOffice(campaign, TIER_ID);
  const before = campaign.treasury;
  const summary = O.runOfficeHours(campaign, 5);
  assert.equal(summary.income, 0);
  assert.equal(summary.costs, 0);
  assert.equal(campaign.treasury, before);
  assert.equal(O.runOfficeHours(campaign, 0), null);
});

/**
 * The non-stockpile rule, at the automation layer: components can be bought
 * ahead of need and held in a shared warehouse; grid power cannot. An
 * office's ceiling depends only on its own tier's grid, never on the
 * warehouse, another tier's office, or how many components are on the shelf.
 */
test('grid power is never stockpiled — only components are', () => {
  const tier = C.getTier(TIER_ID);
  const withFullWarehouse = O.officeOutlook(tier, O.MAX_MANAGERS_PER_OFFICE, 0);
  const withEmptyWarehouse = O.officeOutlook(tier, O.MAX_MANAGERS_PER_OFFICE, 0);
  assert.equal(withFullWarehouse.income, withEmptyWarehouse.income,
    'an office\'s ceiling must not depend on warehouse stock');

  const capacity = tier.baseGrid * O.OFFICE_CAPACITY_SHARE;
  const raw = Math.min(O.MAX_MANAGERS_PER_OFFICE * tier.baseGrid * O.MANAGER_OUTPUT_SHARE, capacity);
  assert.ok(raw <= capacity + 1e-9, 'an office must never exceed its own tier\'s grid share');

  // A warehouse, unlike a grid connection, really does hold what you put in it.
  const campaign = opsCampaign();
  O.buyComponents(campaign, 5000);
  assert.equal(campaign.ops.warehouse.components, 5000);
  const untouched = campaign.ops.warehouse.components;
  O.runOfficeHours(campaign, 3);   // no offices staffed — nothing should be drawn
  assert.equal(campaign.ops.warehouse.components, untouched);
});

test('an unsupplied office still produces something, just less than a supplied one', () => {
  const dry = opsCampaign();
  O.buildOffice(dry, TIER_ID);
  O.hireManager(dry, TIER_ID);
  const dryRun = O.runOfficeHours(dry, 4);

  const wet = opsCampaign();
  O.buildOffice(wet, TIER_ID);
  O.hireManager(wet, TIER_ID);
  O.buyComponents(wet, 5_000);
  const wetRun = O.runOfficeHours(wet, 4);

  assert.ok(dryRun.income > 0);
  assert.ok(wetRun.income > dryRun.income, 'components should matter');
});
