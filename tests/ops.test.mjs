import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as O from '../js/ops.js';

/** A campaign with five cities finished, the supply chain open and money in hand. */
function empire(treasury = 3000) {
  const campaign = C.newCampaign();
  for (const city of C.CITIES.slice(0, 5)) {
    campaign.claimed[city.id] = [...Array(25).keys()];
  }
  campaign.treasury = treasury;
  campaign.ops = O.newOps();
  return campaign;
}

test('a depot costs money and starts empty', () => {
  const campaign = empire();
  assert.equal(O.buyWarehouse(campaign, 'nyc').ok, true);
  assert.equal(campaign.treasury, 3000 - O.WAREHOUSE_COST);
  assert.equal(O.stockTotal(campaign.ops.warehouses.nyc), 0);
  assert.equal(O.buyWarehouse(campaign, 'nyc').ok, false, 'no second depot in one city');
});

test('a depot cannot be bought without the money', () => {
  const campaign = empire(10);
  const result = O.buyWarehouse(campaign, 'nyc');
  assert.equal(result.ok, false);
  assert.equal(campaign.treasury, 10);
});

test('ice is never warehoused — it would melt', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  assert.deepEqual(Object.keys(campaign.ops.warehouses.nyc.stock).sort(), ['cups', 'lemons', 'sugar']);
  O.restock(campaign, 'nyc', { lemons: 10, sugar: 10, cups: 10, ice: 500 });
  assert.equal(campaign.ops.warehouses.nyc.stock.ice, undefined);
});

test('buying in bulk is cheaper per unit', () => {
  const small = O.restockCost({ lemons: 100 }) / 100;
  const large = O.restockCost({ lemons: 2500 }) / 2500;
  assert.ok(large < small * 0.9, `${large} vs ${small}`);
});

test('a depot will not take more than it can hold', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  const tooMuch = O.restock(campaign, 'nyc', { lemons: 99_999, sugar: 0, cups: 0 });
  assert.equal(tooMuch.ok, false);
  assert.equal(O.stockTotal(campaign.ops.warehouses.nyc), 0);

  const upgraded = O.upgradeWarehouse(campaign, 'nyc');
  assert.equal(upgraded.ok, true);
  assert.equal(campaign.ops.warehouses.nyc.capacity, O.WAREHOUSE_BASE_CAPACITY + O.CAPACITY_UPGRADE_STEP);
});

test('restocking spends from the treasury', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  const before = campaign.treasury;
  const { ok, cost } = O.restock(campaign, 'nyc', { lemons: 400, sugar: 400, cups: 800 });
  assert.equal(ok, true);
  assert.equal(campaign.treasury, Math.round((before - cost) * 100) / 100);
  assert.equal(O.stockTotal(campaign.ops.warehouses.nyc), 1600);
});

test('staff can only be hired onto a claimed corner, from a city with a depot', () => {
  const campaign = empire();
  assert.equal(O.hireStaff(campaign, 'nyc', 0).ok, false, 'needs a depot first');
  O.buyWarehouse(campaign, 'nyc');
  assert.equal(O.hireStaff(campaign, 'nyc', 0).ok, true);
  assert.equal(O.hireStaff(campaign, 'nyc', 0).ok, false, 'already staffed');

  const unclaimed = C.CITIES[9].id; // never played
  O.buyWarehouse(campaign, unclaimed);
  assert.equal(O.hireStaff(campaign, unclaimed, 0).ok, false, 'corner not claimed');
});

test('a staffed, stocked corner earns money while you play elsewhere', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.restock(campaign, 'nyc', { lemons: 500, sugar: 500, cups: 1000 });
  for (let i = 0; i < 4; i++) O.hireStaff(campaign, 'nyc', i);

  const before = campaign.treasury;
  const summary = O.tickOps(campaign, 5);
  assert.equal(summary.days, 5);
  assert.ok(summary.cups > 0, 'should have sold something');
  assert.ok(summary.net > 0, `expected a profit, got ${summary.net}`);
  assert.equal(campaign.treasury, Math.round((before + summary.net) * 100) / 100);
  assert.equal(campaign.ops.day, 5);
});

test('selling draws stock down and running dry raises an alert', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.restock(campaign, 'nyc', { lemons: 20, sugar: 20, cups: 40 });
  for (let i = 0; i < 4; i++) O.hireStaff(campaign, 'nyc', i);

  const summary = O.tickOps(campaign, 6);
  // Whichever ingredient runs out first stops the pouring, so a stray cup or
  // two can be left behind — the depot is spent either way.
  assert.ok(O.stockTotal(campaign.ops.warehouses.nyc) < 5, 'depot should be drained');
  assert.equal(campaign.ops.warehouses.nyc.stock.lemons, 0);
  assert.ok(summary.dry.includes('nyc'));
  assert.ok(campaign.ops.alerts.some((a) => a.cityId === 'nyc'));
});

test('wages and upkeep are still owed on a day with nothing to sell', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');           // no stock at all
  for (let i = 0; i < 3; i++) O.hireStaff(campaign, 'nyc', i);
  const before = campaign.treasury;
  const summary = O.tickOps(campaign, 2);
  assert.equal(summary.cups, 0);
  assert.ok(summary.net < 0, 'an idle payroll costs money');
  assert.ok(campaign.treasury < before);
});

test('the daily outlook counts stock, wages, ice and rent', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.restock(campaign, 'nyc', { lemons: 400, sugar: 400, cups: 800 });
  for (let i = 0; i < 5; i++) O.hireStaff(campaign, 'nyc', i);

  const look = O.cityOutlook(campaign, 'nyc');
  assert.equal(look.corners, 5);
  assert.ok(look.revenue > 0);
  assert.ok(look.stockCost > 0, 'a day of trading consumes stock');
  assert.equal(look.wages, 5 * O.STAFF_WAGE);
  assert.ok(look.costs > look.wages + look.stockCost);
  assert.equal(look.net, Math.round((look.revenue - look.costs) * 100) / 100);
  assert.ok(look.daysOfStock > 0);
});

test('closing a stand stops its wages', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.hireStaff(campaign, 'nyc', 0);
  O.hireStaff(campaign, 'nyc', 1);
  assert.equal(O.closeStand(campaign, 'nyc', 0).ok, true);
  assert.deepEqual(O.staffedIn(campaign.ops, 'nyc'), [1]);
  assert.equal(O.closeStand(campaign, 'nyc', 0).ok, false);
});

test('a network with no staff does nothing at all', () => {
  const campaign = empire();
  const before = campaign.treasury;
  const summary = O.tickOps(campaign, 10);
  assert.equal(summary.net, 0);
  assert.equal(campaign.treasury, before);
});
