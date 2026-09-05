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

/* -------------------------------------------------------------- *
 * Farms, factories, and the ice maker
 * -------------------------------------------------------------- */

test('a building needs a depot in the same city first', () => {
  const campaign = empire();
  const result = O.buildBuilding(campaign, 'nyc', 'lemonFarm');
  assert.equal(result.ok, false);
  O.buyWarehouse(campaign, 'nyc');
  assert.equal(O.buildBuilding(campaign, 'nyc', 'lemonFarm').ok, true);
  assert.equal(O.hasBuilding(campaign.ops, 'nyc', 'lemonFarm'), true);
});

test('only one of each building per city, and it costs money', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  const before = campaign.treasury;
  const first = O.buildBuilding(campaign, 'nyc', 'caneFarm');
  assert.equal(first.ok, true);
  assert.equal(campaign.treasury, Math.round((before - O.BUILDINGS.caneFarm.cost) * 100) / 100);
  assert.equal(O.buildBuilding(campaign, 'nyc', 'caneFarm').ok, false, 'already built');
});

test('a lemon farm presses free lemons into the depot every day', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buildBuilding(campaign, 'nyc', 'lemonFarm');
  const before = campaign.ops.warehouses.nyc.stock.lemons;
  const summary = O.tickOps(campaign, 1);
  assert.equal(campaign.ops.warehouses.nyc.stock.lemons, before + O.BUILDINGS.lemonFarm.dailyYield);
  assert.equal(summary.produced.lemons, O.BUILDINGS.lemonFarm.dailyYield);
});

test('production never overflows the depot', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buildBuilding(campaign, 'nyc', 'lemonFarm');
  const w = campaign.ops.warehouses.nyc;
  w.stock.lemons = w.capacity - 10; // almost full, less than one day's yield
  const summary = O.tickOps(campaign, 1);
  assert.equal(w.stock.lemons, w.capacity);
  assert.equal(summary.produced.lemons, 10);
});

test('building upkeep is charged whether or not anything gets made', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buildBuilding(campaign, 'nyc', 'cupFactory');
  campaign.ops.warehouses.nyc.capacity = campaign.ops.warehouses.nyc.stock.cups; // depot already full
  const before = campaign.treasury;
  const summary = O.tickOps(campaign, 3);
  assert.equal(summary.produced.cups, 0, 'no room to press into');
  // The depot itself is owed too, staffed or not — a depot is paid for whether it sells or not.
  const depotUpkeep = 3 * O.effectiveWarehouseUpkeep(campaign);
  assert.equal(campaign.treasury, Math.round((before - 3 * O.BUILDINGS.cupFactory.upkeep - depotUpkeep) * 100) / 100);
});

test('an ice maker covers ice for free up to its daily press', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.restock(campaign, 'nyc', { lemons: 500, sugar: 500, cups: 1000 });
  for (let i = 0; i < 3; i++) O.hireStaff(campaign, 'nyc', i);

  const withoutMaker = O.cityOutlook(campaign, 'nyc');
  O.buildBuilding(campaign, 'nyc', 'iceMaker');
  const withMaker = O.cityOutlook(campaign, 'nyc');

  assert.ok(withMaker.iceCost < withoutMaker.iceCost, 'ice should be cheaper with a maker');
  assert.ok(withMaker.net > withoutMaker.net - O.BUILDINGS.iceMaker.upkeep, 'the maker should pay for itself in ice savings');
});

test('an ice maker never touches the warehoused stock — ice still melts', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buildBuilding(campaign, 'nyc', 'iceMaker');
  O.tickOps(campaign, 5);
  assert.equal(campaign.ops.warehouses.nyc.stock.ice, undefined);
});

test('a farm can be grown up to its max level, and yield and upkeep both scale with it', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  assert.equal(O.upgradeBuilding(campaign, 'nyc', 'lemonFarm').ok, false, 'nothing to grow yet');

  O.buildBuilding(campaign, 'nyc', 'lemonFarm');
  assert.equal(O.buildingLevel(campaign.ops, 'nyc', 'lemonFarm'), 1);
  assert.equal(O.buildingYieldFor('lemonFarm', 1), O.BUILDINGS.lemonFarm.dailyYield);

  const before = campaign.treasury;
  const up = O.upgradeBuilding(campaign, 'nyc', 'lemonFarm');
  assert.equal(up.ok, true);
  assert.equal(up.level, 2);
  assert.equal(campaign.treasury, Math.round((before - O.buildingUpgradeCost(1)) * 100) / 100);
  assert.equal(O.buildingYieldFor('lemonFarm', 2), O.BUILDINGS.lemonFarm.dailyYield * 2);
  assert.equal(O.buildingUpkeepFor('lemonFarm', 2), O.BUILDINGS.lemonFarm.upkeep * 2);

  O.upgradeBuilding(campaign, 'nyc', 'lemonFarm');
  assert.equal(O.buildingLevel(campaign.ops, 'nyc', 'lemonFarm'), O.BUILDING_MAX_LEVEL);
  assert.equal(O.upgradeBuilding(campaign, 'nyc', 'lemonFarm').ok, false, 'already at max size');
});

test('a grown farm presses proportionally more into the depot each day', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buildBuilding(campaign, 'nyc', 'lemonFarm');
  O.upgradeBuilding(campaign, 'nyc', 'lemonFarm');
  const before = campaign.ops.warehouses.nyc.stock.lemons;
  const summary = O.tickOps(campaign, 1);
  assert.equal(campaign.ops.warehouses.nyc.stock.lemons, before + O.BUILDINGS.lemonFarm.dailyYield * 2);
  assert.equal(summary.produced.lemons, O.BUILDINGS.lemonFarm.dailyYield * 2);
});

test('a boolean-true building from before levels existed reads as level 1', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  campaign.ops.buildings.nyc = { lemonFarm: true };
  assert.equal(O.buildingLevel(campaign.ops, 'nyc', 'lemonFarm'), 1);
  assert.equal(O.hasBuilding(campaign.ops, 'nyc', 'lemonFarm'), true);
});

test('farm production shows up as a real profit gain in the daily estimate', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.restock(campaign, 'nyc', { lemons: 500, sugar: 500, cups: 1000 });
  for (let i = 0; i < 4; i++) O.hireStaff(campaign, 'nyc', i);

  const before = O.cityOutlook(campaign, 'nyc');
  O.buildBuilding(campaign, 'nyc', 'lemonFarm');
  const after = O.cityOutlook(campaign, 'nyc');
  assert.ok(after.farmSavings > 0);
  assert.ok(after.net > before.net - O.BUILDINGS.lemonFarm.upkeep);
});

test('a self-sufficient depot reports steady stock instead of a countdown', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buildBuilding(campaign, 'nyc', 'lemonFarm');
  O.buildBuilding(campaign, 'nyc', 'caneFarm');
  O.buildBuilding(campaign, 'nyc', 'cupFactory');
  O.restock(campaign, 'nyc', { lemons: 50, sugar: 50, cups: 100 });
  for (let i = 0; i < 2; i++) O.hireStaff(campaign, 'nyc', i); // modest demand, farms outproduce it

  const look = O.cityOutlook(campaign, 'nyc');
  assert.equal(look.daysOfStock, Infinity);
});

/* -------------------------------------------------------------- *
 * Trucks
 * -------------------------------------------------------------- */

test('a truck needs a depot at both ends before it can be routed', () => {
  const campaign = empire();
  const bought = O.buyTruck(campaign);
  assert.equal(bought.ok, true);
  assert.equal(O.assignTruckRoute(campaign, bought.id, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 100 }).ok, false);
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'austin');
  assert.equal(O.assignTruckRoute(campaign, bought.id, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 100 }).ok, true);
});

test('a truck cannot run from a city to itself', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  const { id } = O.buyTruck(campaign);
  assert.equal(O.assignTruckRoute(campaign, id, { from: 'nyc', to: 'nyc', cargo: 'lemons', amount: 100 }).ok, false);
});

test('an assigned truck hauls cargo from one depot to another every day', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'austin');
  O.restock(campaign, 'nyc', { lemons: 1000, sugar: 0, cups: 0 });
  const { id } = O.buyTruck(campaign);
  O.assignTruckRoute(campaign, id, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 200 });

  const summary = O.tickOps(campaign, 3);
  assert.equal(campaign.ops.warehouses.nyc.stock.lemons, 1000 - 600);
  assert.equal(campaign.ops.warehouses.austin.stock.lemons, 600);
  assert.equal(summary.trucked, 600);
});

test('a truck only moves what is actually there, and does not overfill the destination', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'austin');
  O.restock(campaign, 'nyc', { lemons: 50, sugar: 0, cups: 0 }); // less than the truck's daily amount
  campaign.ops.warehouses.austin.capacity = 30; // barely any room at the other end
  const { id } = O.buyTruck(campaign);
  O.assignTruckRoute(campaign, id, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 200 });

  O.tickOps(campaign, 1);
  assert.equal(campaign.ops.warehouses.austin.stock.lemons, 30);
  assert.equal(campaign.ops.warehouses.nyc.stock.lemons, 20);
});

test('an idle truck costs nothing until it has a route', () => {
  const campaign = empire();
  O.buyTruck(campaign);
  const before = campaign.treasury;
  const summary = O.tickOps(campaign, 5);
  assert.equal(summary.costs, 0);
  assert.equal(campaign.treasury, before);
});

test('unassigning a truck parks it for free', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'austin');
  const { id } = O.buyTruck(campaign);
  O.assignTruckRoute(campaign, id, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 100 });
  assert.equal(O.unassignTruck(campaign, id).ok, true);
  const before = campaign.treasury;
  O.tickOps(campaign, 3);
  // Two depots still owe their own upkeep; the parked truck must add nothing on top.
  const depots = 2 * 3 * O.effectiveWarehouseUpkeep(campaign);
  assert.equal(campaign.treasury, Math.round((before - depots) * 100) / 100, 'a parked truck should not be charged upkeep');
});

/* -------------------------------------------------------------- *
 * Fleet tiers, and ships/planes crossing the Atlantic
 * -------------------------------------------------------------- */

test('bigger trucks cost more, haul more, and cost more upkeep', () => {
  const campaign = empire();
  const pickup = O.buyTruck(campaign, 'pickup');
  const semi = O.buyTruck(campaign, 'semi');
  assert.equal(campaign.treasury, 3000 - O.VEHICLES.pickup.cost - O.VEHICLES.semi.cost);
  assert.ok(O.VEHICLES.semi.maxAmount > O.VEHICLES.pickup.maxAmount);
  assert.ok(O.effectiveTruckUpkeep(campaign, 'semi') > O.effectiveTruckUpkeep(campaign, 'pickup'));
});

test('a route can never be assigned more than its vehicle\'s daily maximum', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'austin');
  const { id } = O.buyTruck(campaign, 'pickup');
  O.assignTruckRoute(campaign, id, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 999999 });
  const truck = campaign.ops.trucks.find((t) => t.id === id);
  assert.equal(truck.amount, O.VEHICLES.pickup.maxAmount);
});

test('trucks stay on one continent — ships and planes are for crossing the ocean', () => {
  const campaign = empire(10000);
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'rome');
  const truck = O.buyTruck(campaign, 'box');
  const overseas = O.assignTruckRoute(campaign, truck.id, { from: 'nyc', to: 'rome', cargo: 'lemons', amount: 100 });
  assert.equal(overseas.ok, false, 'a truck cannot cross the Atlantic');

  const ship = O.buyTruck(campaign, 'cargoShip');
  assert.equal(O.assignTruckRoute(campaign, ship.id, { from: 'nyc', to: 'rome', cargo: 'lemons', amount: 100 }).ok, true);
});

test('ships and planes cannot be used for a same-region route — a truck is cheaper there', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'austin');
  const plane = O.buyTruck(campaign, 'cargoPlane');
  const result = O.assignTruckRoute(campaign, plane.id, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 100 });
  assert.equal(result.ok, false);
});

test('a cargo ship actually hauls cargo across the Atlantic every day', () => {
  const campaign = empire(10000);
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'rome');
  O.restock(campaign, 'nyc', { lemons: 2000, sugar: 0, cups: 0 }); // depot capacity is 2500
  const { id } = O.buyTruck(campaign, 'cargoShip');
  O.assignTruckRoute(campaign, id, { from: 'nyc', to: 'rome', cargo: 'lemons', amount: 2000 });
  const summary = O.tickOps(campaign, 1);
  assert.equal(summary.trucked, 2000);
  assert.equal(campaign.ops.warehouses.rome.stock.lemons, 2000);
});

test('a truck bought before vehicle tiers existed defaults to the old flat behavior, not a nerf', () => {
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'austin');
  campaign.ops.trucks.push({ id: 999, from: null, to: null, cargo: 'lemons', amount: 100 }); // no `tier` field
  const result = O.assignTruckRoute(campaign, 999, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 2000 });
  assert.equal(result.ok, true, 'an old truck should still cap near its old 2000/day ceiling, not far below it');
});

test('a farm can feed a truck that feeds a staffed corner in a different city', () => {
  // The full chain: production in one city, distribution to another, then trade.
  const campaign = empire();
  O.buyWarehouse(campaign, 'nyc');
  O.buyWarehouse(campaign, 'austin');
  O.buildBuilding(campaign, 'nyc', 'lemonFarm');
  O.restock(campaign, 'nyc', { lemons: 0, sugar: 500, cups: 500 }); // no lemons bought — only farmed
  O.restock(campaign, 'austin', { lemons: 0, sugar: 500, cups: 500 });
  const { id } = O.buyTruck(campaign);
  O.assignTruckRoute(campaign, id, { from: 'nyc', to: 'austin', cargo: 'lemons', amount: 150 });
  for (let i = 0; i < 3; i++) O.hireStaff(campaign, 'austin', i);

  const summary = O.tickOps(campaign, 4);
  assert.ok(summary.trucked > 0, 'the farm\'s lemons should have moved');
  assert.ok(summary.cups > 0, 'Austin should have sold cups using trucked-in lemons');
});

test('a depot is paid for whether or not anyone is staffed to sell from it', () => {
  const campaign = C.newCampaign();
  campaign.ops = O.newOps();
  campaign.treasury = 1000;
  O.buyWarehouse(campaign, 'nyc');
  const afterBuild = campaign.treasury;
  const summary = O.tickOps(campaign, 3);
  assert.ok(campaign.treasury < afterBuild, 'upkeep was charged with nobody staffed');
  assert.ok(summary.costs > 0);
});
