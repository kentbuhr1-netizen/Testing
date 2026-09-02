import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as O from '../js/ops.js';
import * as E from '../js/employees.js';

function empire(treasury = 3000) {
  const campaign = C.newCampaign();
  for (const city of C.CITIES.slice(0, 5)) {
    campaign.claimed[city.id] = [...Array(25).keys()];
  }
  campaign.treasury = treasury;
  campaign.ops = O.newOps();
  return campaign;
}

test('a fresh campaign starts with an empty office', () => {
  const campaign = C.newCampaign();
  assert.deepEqual(campaign.employees, {});
  assert.equal(E.headcount(campaign), 0);
  assert.equal(E.dailyWages(campaign), 0);
});

test('hiring costs money and can only happen once per role', () => {
  const campaign = empire(1000);
  const result = E.hire(campaign, 'finance');
  assert.equal(result.ok, true);
  assert.equal(campaign.treasury, 1000 - E.EMPLOYEES.finance.cost);
  assert.equal(E.isHired(campaign, 'finance'), true);

  const again = E.hire(campaign, 'finance');
  assert.equal(again.ok, false);

  assert.equal(E.hire(campaign, 'nope').ok, false, 'not a real role');
});

test('hiring fails without enough in the treasury', () => {
  const campaign = empire(10);
  const result = E.hire(campaign, 'finance');
  assert.equal(result.ok, false);
  assert.equal(campaign.treasury, 10);
});

test('wages accumulate per hire and are paid once per settled run, by the day', () => {
  const campaign = empire(2000);
  E.hire(campaign, 'finance');
  E.hire(campaign, 'hr');
  const dailyExpected = E.EMPLOYEES.finance.wage + E.EMPLOYEES.hr.wage;
  assert.equal(E.dailyWages(campaign), dailyExpected);

  const before = campaign.treasury;
  const paid = E.payWages(campaign, 5);
  assert.equal(paid, dailyExpected * 5);
  assert.equal(campaign.treasury, Math.round((before - paid) * 100) / 100);

  assert.equal(E.payWages(campaign, 0), 0, 'no days, no pay');
});

test('a save from before this feature existed gets an office lazily', () => {
  const campaign = C.newCampaign();
  delete campaign.employees;
  assert.equal(campaign.employees, undefined);
  const staff = E.ensureStaff(campaign);
  assert.deepEqual(staff, {});
  assert.equal(campaign.employees, staff);
});

test('unhired roles are always a 1x multiplier — off means untouched', () => {
  const campaign = empire();
  assert.equal(E.upkeepMult(campaign), 1);
  assert.equal(E.wholesaleMult(campaign), 1);
  assert.equal(E.wageMult(campaign), 1);
  assert.equal(E.hireCostMult(campaign), 1);
  assert.equal(E.flavorMult(campaign), 1);
  assert.equal(E.interestBonus(campaign), 0);
  assert.equal(E.hasMA(campaign), false);
});

test('the Logistics Manager discounts depot/truck upkeep and wholesale orders', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  const before = O.restockCost({ lemons: 100, sugar: 100, cups: 100 }, campaign);
  E.hire(campaign, 'logistics');
  const after = O.restockCost({ lemons: 100, sugar: 100, cups: 100 }, campaign);
  assert.ok(after < before, 'wholesale orders get cheaper once hired');
  assert.equal(O.effectiveWarehouseUpkeep(campaign), Math.round(O.WAREHOUSE_UPKEEP * 0.75 * 100) / 100);
  assert.equal(O.effectiveTruckUpkeep(campaign, 'semi'), Math.round(O.VEHICLES.semi.upkeep * 0.75 * 100) / 100);
});

test('the HR Manager discounts staff wages and hiring cost', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  E.hire(campaign, 'hr');
  assert.equal(O.effectiveWage(campaign), Math.round(O.STAFF_WAGE * 0.75 * 100) / 100);
  assert.equal(O.effectiveHireCost(campaign), Math.round(O.STAFF_HIRE_COST * 0.75 * 100) / 100);
});

test('the Flavor Scientist raises what staffed corners earn, not what they cost', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.restock(campaign, 'nyc', { lemons: 5000, sugar: 5000, cups: 5000 });
  for (let i = 0; i < 3; i++) O.hireStaff(campaign, 'nyc', i);
  const before = O.cityOutlook(campaign, 'nyc');
  E.hire(campaign, 'flavor');
  const after = O.cityOutlook(campaign, 'nyc');
  assert.equal(after.revenue, Math.round(before.revenue * 1.08 * 100) / 100);
  assert.equal(after.stockCost, before.stockCost, 'flavor science does not touch cost');
});
