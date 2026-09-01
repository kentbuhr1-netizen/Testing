/**
 * Lemonade Stand — operations: warehouses, wholesale buying, production and
 * distribution.
 *
 * Unlocked once five cities are complete. Corners you have already claimed can
 * be staffed and supplied from a city warehouse, so they trade on their own
 * while you work a new corner by hand. Campaign days tick with the days you
 * play, so the network earns exactly as fast as you do.
 *
 * Ice is deliberately absent from the warehouse: it melts, so staffed corners
 * buy it locally at street prices — unless the city has an ice maker, which
 * presses a fresh batch every morning instead of ever stockpiling any. The
 * same rule that shapes the core game shapes the empire.
 */
import { CITIES, getCity, cornersFor, claimedIn, TIERS, mergeMods } from './campaign.js';
import { withMods, mulberry32 } from './sim.js';
import * as Employees from './employees.js';

export const WAREHOUSE_COST = 250;
export const WAREHOUSE_BASE_CAPACITY = 2500;  // units of stock (any mix)
export const CAPACITY_UPGRADE_COST = 220;
export const CAPACITY_UPGRADE_STEP = 2000;
export const STAFF_HIRE_COST = 60;            // one-off, per corner
export const STAFF_WAGE = 4;                  // per staffed corner per day
export const WAREHOUSE_UPKEEP = 3;            // per warehouse per day

/** Wholesale unit prices — cheaper than the street, cheaper still in bulk. */
export const WHOLESALE = { lemons: 0.26, sugar: 0.2, cups: 0.06 };
const BULK_BREAKS = [
  { min: 2000, discount: 0.8 },
  { min: 1000, discount: 0.87 },
  { min: 400, discount: 0.94 },
  { min: 0, discount: 1 },
];

export function bulkDiscount(qty) {
  return BULK_BREAKS.find((b) => qty >= b.min).discount;
}

export function wholesaleCost(unit, qty) {
  return Math.round(WHOLESALE[unit] * qty * bulkDiscount(qty) * 100) / 100;
}

// Employee discounts read as multipliers off the base constants above, so
// "no employee hired" always reduces to the numbers this file already had.
export const effectiveWage = (campaign) => Math.round(STAFF_WAGE * Employees.wageMult(campaign) * 100) / 100;
export const effectiveHireCost = (campaign) => Math.round(STAFF_HIRE_COST * Employees.hireCostMult(campaign) * 100) / 100;
export const effectiveWarehouseUpkeep = (campaign) => Math.round(WAREHOUSE_UPKEEP * Employees.upkeepMult(campaign) * 100) / 100;
export const effectiveTruckUpkeep = (campaign) => Math.round(TRUCK_UPKEEP * Employees.upkeepMult(campaign) * 100) / 100;

/**
 * Production buildings — at most one of each per city. Each needs a depot to
 * work with and costs upkeep every day whether or not it has anywhere to put
 * its output. Three of them press raw stock into the depot each morning; the
 * ice maker instead hands staffed corners a free daily allowance of ice
 * before the street price kicks in, since ice is never warehoused.
 */
export const BUILDINGS = {
  lemonFarm:  { id: 'lemonFarm',  label: 'Lemon Farm',      icon: '🍋', unit: 'lemons', cost: 450, dailyYield: 220, upkeep: 4 },
  caneFarm:   { id: 'caneFarm',   label: 'Sugar Cane Farm', icon: '🎋', unit: 'sugar',  cost: 450, dailyYield: 220, upkeep: 4 },
  cupFactory: { id: 'cupFactory', label: 'Cup Factory',     icon: '📦', unit: 'cups',   cost: 380, dailyYield: 450, upkeep: 3 },
  iceMaker:   { id: 'iceMaker',   label: 'Ice Maker',       icon: '🧊', unit: 'ice',    cost: 320, dailyYield: 400, upkeep: 5 },
};

/** Which building supplies which warehoused good (the ice maker is not one — see above). */
const STOCK_BUILDING_FOR = { lemons: 'lemonFarm', sugar: 'caneFarm', cups: 'cupFactory' };

export const TRUCK_COST = 300;
export const TRUCK_UPKEEP = 2;   // per day, only while a truck is running a route
export const TRUCK_CARGO = ['lemons', 'sugar', 'cups'];

export function newOps() {
  return {
    day: 0,
    warehouses: {},   // cityId → { capacity, stock: { lemons, sugar, cups } }
    staffed: {},      // cityId → [cornerIndex]
    buildings: {},    // cityId → { lemonFarm: true, caneFarm: true, ... }
    trucks: [],       // [{ id, from, to, cargo, amount }] — from/to/cargo null until assigned
    nextTruckId: 1,
    ledger: [],       // most recent days first
    alerts: [],
    totals: { income: 0, costs: 0, cups: 0 },
  };
}

/** Fills in fields a save made before buildings/trucks existed won't have. */
function ensureOpsShape(ops) {
  if (!ops) return ops;
  if (!ops.buildings) ops.buildings = {};
  if (!ops.trucks) ops.trucks = [];
  if (ops.nextTruckId == null) ops.nextTruckId = ops.trucks.reduce((n, t) => Math.max(n, t.id || 0), 0) + 1;
  return ops;
}

export const hasWarehouse = (ops, cityId) => Boolean(ops?.warehouses?.[cityId]);
export const staffedIn = (ops, cityId) => ops?.staffed?.[cityId] || [];
export const isStaffed = (ops, cityId, i) => staffedIn(ops, cityId).includes(i);
export const buildingsIn = (ops, cityId) => Object.keys(ops?.buildings?.[cityId] || {}).filter((id) => ops.buildings[cityId][id]);
export const hasBuilding = (ops, cityId, buildingId) => Boolean(ops?.buildings?.[cityId]?.[buildingId]);

export function stockTotal(warehouse) {
  if (!warehouse) return 0;
  const s = warehouse.stock;
  return s.lemons + s.sugar + s.cups;
}

export function spaceLeft(warehouse) {
  return Math.max(0, warehouse.capacity - stockTotal(warehouse));
}

/** Adds stock without ever pushing a depot over capacity. Returns what fit. */
function addStock(warehouse, unit, amount) {
  if (!warehouse || amount <= 0) return 0;
  const fit = Math.min(amount, spaceLeft(warehouse));
  warehouse.stock[unit] += fit;
  return fit;
}

/* ------------------------------------------------------------------ *
 * What a staffed corner does on an average day
 * ------------------------------------------------------------------ */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Staff work an average day rather than a simulated one: no weather roll, no
 * recipe to dial in. They also price a little under the mark — that gap is
 * what you are paid for when you work a corner yourself.
 */
export function cornerOutlook(cityId, cornerIndex) {
  const corner = cornersFor(cityId)[cornerIndex];
  const cityMods = getCity(cityId).challenge.mods;
  const mods = withMods(mergeMods(TIERS[corner.tier].mods, cityMods, corner.mods));

  const avgTemp = 76 + mods.tempShift;
  const heat = clamp((avgTemp - 48) / 46, 0, 1);
  const thirst = 0.35 + 1.25 * heat * heat;
  const cups = Math.max(0, Math.round(14 * thirst * mods.traffic * (mods.hotBias > 1 ? 1.05 : 0.95)));

  const willingness = (0.1 + 1.35 * 0.9 + 0.7 * heat) * mods.willingness;
  const price = Math.round(0.7 * willingness * 0.85 * 100) / 100;

  const icePerCup = clamp(Math.round((avgTemp - 52) / 12) + mods.iceExtra, 0, 7);
  const iceUnits = cups * icePerCup;
  const icePriceEach = 0.05 * mods.icePrice;
  const iceCost = Math.round(iceUnits * icePriceEach * 100) / 100;

  // 5 lemons + 5 sugar per 10 cups, plus a cup each
  const needs = { lemons: Math.ceil(cups / 2), sugar: Math.ceil(cups / 2), cups };
  return {
    cups,
    price,
    revenue: Math.round(cups * price * 100) / 100,
    iceCost,
    iceUnits,
    icePriceEach,
    rent: mods.rent,
    needs,
    // Stock was paid for at the depot, but a day still eats this much value.
    stockCost: restockCost(needs),
  };
}

/** Everything a city's staffed corners would do in one day, if stocked. */
export function cityOutlook(campaign, cityId) {
  const ops = ensureOpsShape(campaign.ops);
  const staffed = staffedIn(ops, cityId);
  const rows = staffed.map((i) => ({ index: i, ...cornerOutlook(cityId, i) }));
  const sum = (key) => rows.reduce((n, r) => n + r[key], 0);
  const needs = rows.reduce(
    (acc, r) => ({
      lemons: acc.lemons + r.needs.lemons,
      sugar: acc.sugar + r.needs.sugar,
      cups: acc.cups + r.needs.cups,
    }),
    { lemons: 0, sugar: 0, cups: 0 }
  );

  const built = buildingsIn(ops, cityId);
  const buildingUpkeep = built.reduce((n, id) => n + BUILDINGS[id].upkeep, 0);

  // A farm or factory offsets the wholesale cost of what it can supply.
  const farmSavings = ['lemons', 'sugar', 'cups'].reduce((n, unit) => {
    const bId = STOCK_BUILDING_FOR[unit];
    if (!hasBuilding(ops, cityId, bId)) return n;
    return n + Math.min(needs[unit], BUILDINGS[bId].dailyYield) * WHOLESALE[unit];
  }, 0);

  // An ice maker covers ice up to its daily press before the street price applies.
  const iceUnitsNeeded = sum('iceUnits');
  const iceCostGross = sum('iceCost');
  const avgIcePrice = iceUnitsNeeded > 0 ? iceCostGross / iceUnitsNeeded : 0;
  const freeIce = hasBuilding(ops, cityId, 'iceMaker') ? Math.min(iceUnitsNeeded, BUILDINGS.iceMaker.dailyYield) : 0;

  const wages = Math.round(staffed.length * effectiveWage(campaign) * 100) / 100;
  const upkeep = (hasWarehouse(ops, cityId) ? effectiveWarehouseUpkeep(campaign) : 0) + buildingUpkeep;
  const revenue = Math.round(sum('revenue') * Employees.flavorMult(campaign) * 100) / 100;
  const stockCost = Math.round(Math.max(0, sum('stockCost') * Employees.wholesaleMult(campaign) - farmSavings) * 100) / 100;
  const iceCost = Math.round(Math.max(0, iceCostGross - freeIce * avgIcePrice) * 100) / 100;
  const costs = Math.round((iceCost + sum('rent') + wages + upkeep + stockCost) * 100) / 100;
  return {
    cityId,
    corners: rows.length,
    cups: sum('cups'),
    revenue,
    stockCost,
    iceCost,
    farmSavings: Math.round(farmSavings * 100) / 100,
    wages,
    upkeep,
    buildingUpkeep,
    buildings: built,
    costs,
    net: Math.round((revenue - costs) * 100) / 100,
    needs,
    daysOfStock: daysOfStock(ops.warehouses[cityId], needs, buildingYields(ops, cityId)),
  };
}

/** What a city's farms and factory add to the depot each day, by unit. */
function buildingYields(ops, cityId) {
  const out = { lemons: 0, sugar: 0, cups: 0 };
  for (const [unit, buildingId] of Object.entries(STOCK_BUILDING_FOR)) {
    if (hasBuilding(ops, cityId, buildingId)) out[unit] = BUILDINGS[buildingId].dailyYield;
  }
  return out;
}

/**
 * How many more days the warehouse can feed this city's staffed corners.
 * `Infinity` means production keeps up (or nothing at all is being drawn
 * down) — the UI shows that as a steady supply rather than a number of days.
 */
export function daysOfStock(warehouse, needs, production = { lemons: 0, sugar: 0, cups: 0 }) {
  if (!warehouse) return 0;
  const per = (unit) => {
    const net = needs[unit] - (production[unit] || 0);
    return net <= 0 ? Infinity : Math.floor(warehouse.stock[unit] / net);
  };
  return Math.min(per('lemons'), per('sugar'), per('cups'));
}

export function networkOutlook(campaign) {
  const cities = CITIES.filter((c) => staffedIn(campaign.ops, c.id).length > 0).map((c) =>
    cityOutlook(campaign, c.id)
  );
  return {
    cities,
    corners: cities.reduce((n, c) => n + c.corners, 0),
    net: Math.round(cities.reduce((n, c) => n + c.net, 0) * 100) / 100,
    revenue: Math.round(cities.reduce((n, c) => n + c.revenue, 0) * 100) / 100,
  };
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export function buyWarehouse(campaign, cityId) {
  const ops = ensureOpsShape(campaign.ops);
  if (hasWarehouse(ops, cityId)) return { ok: false, why: 'You already have a depot here.' };
  if (campaign.treasury < WAREHOUSE_COST) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - WAREHOUSE_COST);
  ops.warehouses[cityId] = {
    capacity: WAREHOUSE_BASE_CAPACITY,
    stock: { lemons: 0, sugar: 0, cups: 0 },
  };
  return { ok: true };
}

export function upgradeWarehouse(campaign, cityId) {
  const w = campaign.ops.warehouses[cityId];
  if (!w) return { ok: false, why: 'No depot here yet.' };
  if (campaign.treasury < CAPACITY_UPGRADE_COST) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - CAPACITY_UPGRADE_COST);
  w.capacity += CAPACITY_UPGRADE_STEP;
  return { ok: true };
}

export function restock(campaign, cityId, order) {
  const w = campaign.ops.warehouses[cityId];
  if (!w) return { ok: false, why: 'No depot here yet.' };
  const units = (order.lemons || 0) + (order.sugar || 0) + (order.cups || 0);
  if (units <= 0) return { ok: false, why: 'Nothing ordered.' };
  if (units > spaceLeft(w)) return { ok: false, why: 'The depot cannot hold that much.' };
  const cost = restockCost(order, campaign);
  if (cost > campaign.treasury) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - cost);
  for (const unit of ['lemons', 'sugar', 'cups']) w.stock[unit] += order[unit] || 0;
  return { ok: true, cost };
}

/** `campaign` is optional — omit it for a discount-free estimate (a Logistics Manager only ever lowers this). */
export function restockCost(order, campaign) {
  const units = (order.lemons || 0) + (order.sugar || 0) + (order.cups || 0);
  const discount = bulkDiscount(units); // the whole order counts toward the break
  const raw =
    WHOLESALE.lemons * (order.lemons || 0) +
    WHOLESALE.sugar * (order.sugar || 0) +
    WHOLESALE.cups * (order.cups || 0);
  return Math.round(raw * discount * Employees.wholesaleMult(campaign) * 100) / 100;
}

export function hireStaff(campaign, cityId, cornerIndex) {
  const ops = campaign.ops;
  if (!claimedIn(campaign, cityId).includes(cornerIndex)) {
    return { ok: false, why: 'You have not claimed that corner yet.' };
  }
  if (isStaffed(ops, cityId, cornerIndex)) return { ok: false, why: 'Already staffed.' };
  if (!hasWarehouse(ops, cityId)) return { ok: false, why: 'Build a depot in this city first.' };
  const hireCost = effectiveHireCost(campaign);
  if (campaign.treasury < hireCost) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - hireCost);
  (ops.staffed[cityId] || (ops.staffed[cityId] = [])).push(cornerIndex);
  ops.staffed[cityId].sort((a, b) => a - b);
  return { ok: true };
}

export function closeStand(campaign, cityId, cornerIndex) {
  const list = staffedIn(campaign.ops, cityId);
  const at = list.indexOf(cornerIndex);
  if (at === -1) return { ok: false, why: 'That corner is not staffed.' };
  list.splice(at, 1);
  return { ok: true };
}

/** Build one of the four production buildings. One of each per city, at most. */
export function buildBuilding(campaign, cityId, buildingId) {
  const ops = ensureOpsShape(campaign.ops);
  const def = BUILDINGS[buildingId];
  if (!def) return { ok: false, why: 'No such building.' };
  if (!hasWarehouse(ops, cityId)) return { ok: false, why: 'Build a depot in this city first.' };
  if (hasBuilding(ops, cityId, buildingId)) return { ok: false, why: 'Already built here.' };
  if (campaign.treasury < def.cost) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - def.cost);
  const cityBuildings = ops.buildings[cityId] || (ops.buildings[cityId] = {});
  cityBuildings[buildingId] = true;
  return { ok: true };
}

/** Buy an unassigned truck. Give it a route with assignTruckRoute. */
export function buyTruck(campaign) {
  const ops = ensureOpsShape(campaign.ops);
  if (campaign.treasury < TRUCK_COST) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - TRUCK_COST);
  const id = ops.nextTruckId++;
  ops.trucks.push({ id, from: null, to: null, cargo: 'lemons', amount: 100 });
  return { ok: true, id };
}

/** Point a truck at a route: it hauls `amount` of `cargo` from one depot to another, every day. */
export function assignTruckRoute(campaign, truckId, { from, to, cargo, amount }) {
  const ops = ensureOpsShape(campaign.ops);
  const truck = ops.trucks.find((t) => t.id === truckId);
  if (!truck) return { ok: false, why: 'No such truck.' };
  if (!from || !to) return { ok: false, why: 'Pick both a pickup and a drop-off city.' };
  if (from === to) return { ok: false, why: 'Pick two different cities.' };
  if (!hasWarehouse(ops, from) || !hasWarehouse(ops, to)) return { ok: false, why: 'Both ends need a depot.' };
  if (!TRUCK_CARGO.includes(cargo)) return { ok: false, why: 'Not a haulable good.' };
  truck.from = from;
  truck.to = to;
  truck.cargo = cargo;
  truck.amount = Math.max(1, Math.round(amount) || 0);
  return { ok: true };
}

/** Parks a truck — it costs nothing and moves nothing until reassigned. */
export function unassignTruck(campaign, truckId) {
  const ops = ensureOpsShape(campaign.ops);
  const truck = ops.trucks.find((t) => t.id === truckId);
  if (!truck) return { ok: false, why: 'No such truck.' };
  truck.from = null;
  truck.to = null;
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Advance the network by `days` (one per day you played by hand). Each day:
 * farms and factories press their yield into the depot, trucks haul whatever
 * is sitting there to wherever they are routed, and only then do staffed
 * corners trade against what is left. Corners trade only as far as the depot
 * can feed them; anything short goes on the alert list rather than silently
 * vanishing.
 */
export function tickOps(campaign, days) {
  const ops = ensureOpsShape(campaign.ops);
  if (!ops) return null;
  const summary = {
    days,
    income: 0,
    costs: 0,
    cups: 0,
    stockUsed: { lemons: 0, sugar: 0, cups: 0 },
    produced: { lemons: 0, sugar: 0, cups: 0 },
    trucked: 0,
    dry: [],
  };

  for (let d = 0; d < days; d++) {
    ops.day += 1;

    // 1. Farms and the factory press their yield into the depot; the ice
    //    maker instead banks a free daily allowance for the corners below.
    const freeIce = {};
    for (const cityData of CITIES) {
      const cityId = cityData.id;
      const built = buildingsIn(ops, cityId);
      if (built.length === 0) continue;
      const w = ops.warehouses[cityId];
      let buildingCost = 0;
      for (const id of built) {
        const b = BUILDINGS[id];
        buildingCost += b.upkeep;
        if (id === 'iceMaker') freeIce[cityId] = (freeIce[cityId] || 0) + b.dailyYield;
        else if (w) summary.produced[b.unit] += addStock(w, b.unit, b.dailyYield);
      }
      campaign.treasury = round2(campaign.treasury - buildingCost);
      summary.costs += buildingCost;
    }

    // 2. Trucks haul cargo between depots before the day's trading starts.
    for (const truck of ops.trucks) {
      if (!truck.from || !truck.to) continue;
      const src = ops.warehouses[truck.from];
      const dst = ops.warehouses[truck.to];
      if (!src || !dst) continue;
      const moved = Math.min(truck.amount, src.stock[truck.cargo], spaceLeft(dst));
      if (moved > 0) {
        src.stock[truck.cargo] -= moved;
        dst.stock[truck.cargo] += moved;
        summary.trucked += moved;
      }
      const truckUpkeep = effectiveTruckUpkeep(campaign);
      campaign.treasury = round2(campaign.treasury - truckUpkeep);
      summary.costs += truckUpkeep;
    }

    // 3. Staffed corners trade against whatever the depot now holds.
    for (const cityData of CITIES) {
      const cityId = cityData.id;
      const staffed = staffedIn(ops, cityId);
      if (staffed.length === 0) continue;
      const w = ops.warehouses[cityId];
      const rng = mulberry32(ops.day * 7717 + cityId.length * 131);
      let cityFreeIce = freeIce[cityId] || 0;

      let dayCosts = (hasWarehouse(ops, cityId) ? effectiveWarehouseUpkeep(campaign) : 0) + staffed.length * effectiveWage(campaign);
      let dayIncome = 0;
      let served = 0;

      for (const index of staffed) {
        const look = cornerOutlook(cityId, index);
        // A little day-to-day weather noise, so the network is not a metronome.
        const swing = 0.8 + rng() * 0.45;
        const wanted = Math.round(look.cups * swing);
        const canPour = w
          ? Math.min(
              wanted,
              w.stock.cups,
              Math.floor(w.stock.lemons * 2),
              Math.floor(w.stock.sugar * 2)
            )
          : 0;
        if (canPour < wanted) summary.dry.push(cityId);

        const lemonsUsed = Math.ceil(canPour / 2);
        const sugarUsed = Math.ceil(canPour / 2);
        if (w) {
          w.stock.cups -= canPour;
          w.stock.lemons = Math.max(0, w.stock.lemons - lemonsUsed);
          w.stock.sugar = Math.max(0, w.stock.sugar - sugarUsed);
        }
        summary.stockUsed.lemons += lemonsUsed;
        summary.stockUsed.sugar += sugarUsed;
        summary.stockUsed.cups += canPour;

        const share = look.cups > 0 ? canPour / look.cups : 0;
        const iceNeeded = look.iceUnits * share;
        const fromFree = Math.min(cityFreeIce, iceNeeded);
        cityFreeIce -= fromFree;
        const paidIce = Math.round((iceNeeded - fromFree) * look.icePriceEach * 100) / 100;

        dayIncome += look.price * canPour * Employees.flavorMult(campaign);
        dayCosts += paidIce + look.rent;
        served += canPour;
      }

      summary.income += dayIncome;
      summary.costs += dayCosts;
      summary.cups += served;
      campaign.treasury = round2(campaign.treasury + dayIncome - dayCosts);
    }
  }

  summary.income = round2(summary.income);
  summary.costs = round2(summary.costs);
  summary.net = round2(summary.income - summary.costs);
  ops.totals.income = round2(ops.totals.income + summary.income);
  ops.totals.costs = round2(ops.totals.costs + summary.costs);
  ops.totals.cups += summary.cups;

  summary.dry = [...new Set(summary.dry)];
  ops.alerts = summary.dry.map((cityId) => ({
    cityId,
    text: `${getCity(cityId).name} ran short — corners stood idle.`,
  }));
  ops.ledger.unshift({ day: ops.day, net: summary.net, cups: summary.cups });
  ops.ledger = ops.ledger.slice(0, 30);
  return summary;
}
