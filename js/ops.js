/**
 * Lemonade Stand — operations: warehouses, wholesale buying and distribution.
 *
 * Unlocked once five cities are complete. Corners you have already claimed can
 * be staffed and supplied from a city warehouse, so they trade on their own
 * while you work a new corner by hand. Campaign days tick with the days you
 * play, so the network earns exactly as fast as you do.
 *
 * Ice is deliberately absent from the warehouse: it melts, so staffed corners
 * buy it locally at street prices. The same rule that shapes the core game
 * shapes the empire.
 */
import { CITIES, getCity, cornersFor, claimedIn, TIERS, mergeMods } from './campaign.js';
import { withMods, mulberry32 } from './sim.js';

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

export function newOps() {
  return {
    day: 0,
    warehouses: {},   // cityId → { capacity, stock: { lemons, sugar, cups } }
    staffed: {},      // cityId → [cornerIndex]
    ledger: [],       // most recent days first
    alerts: [],
    totals: { income: 0, costs: 0, cups: 0 },
  };
}

export const hasWarehouse = (ops, cityId) => Boolean(ops?.warehouses?.[cityId]);
export const staffedIn = (ops, cityId) => ops?.staffed?.[cityId] || [];
export const isStaffed = (ops, cityId, i) => staffedIn(ops, cityId).includes(i);

export function stockTotal(warehouse) {
  if (!warehouse) return 0;
  const s = warehouse.stock;
  return s.lemons + s.sugar + s.cups;
}

export function spaceLeft(warehouse) {
  return Math.max(0, warehouse.capacity - stockTotal(warehouse));
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
  const iceCost = Math.round(cups * icePerCup * 0.05 * mods.icePrice * 100) / 100;

  // 5 lemons + 5 sugar per 10 cups, plus a cup each
  const needs = { lemons: Math.ceil(cups / 2), sugar: Math.ceil(cups / 2), cups };
  return {
    cups,
    price,
    revenue: Math.round(cups * price * 100) / 100,
    iceCost,
    rent: mods.rent,
    needs,
    // Stock was paid for at the depot, but a day still eats this much value.
    stockCost: restockCost(needs),
  };
}

/** Everything a city's staffed corners would do in one day, if stocked. */
export function cityOutlook(campaign, cityId) {
  const ops = campaign.ops;
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
  const wages = staffed.length * STAFF_WAGE;
  const upkeep = hasWarehouse(ops, cityId) ? WAREHOUSE_UPKEEP : 0;
  const revenue = Math.round(sum('revenue') * 100) / 100;
  const stockCost = Math.round(sum('stockCost') * 100) / 100;
  const costs = Math.round((sum('iceCost') + sum('rent') + wages + upkeep + stockCost) * 100) / 100;
  return {
    cityId,
    corners: rows.length,
    cups: sum('cups'),
    revenue,
    stockCost,
    wages,
    upkeep,
    costs,
    net: Math.round((revenue - costs) * 100) / 100,
    needs,
    daysOfStock: daysOfStock(ops.warehouses[cityId], needs),
  };
}

/** How many more days the warehouse can feed this city's staffed corners. */
export function daysOfStock(warehouse, needs) {
  if (!warehouse) return 0;
  const per = (unit) => (needs[unit] > 0 ? Math.floor(warehouse.stock[unit] / needs[unit]) : Infinity);
  const days = Math.min(per('lemons'), per('sugar'), per('cups'));
  return Number.isFinite(days) ? days : 0;
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
  if (hasWarehouse(campaign.ops, cityId)) return { ok: false, why: 'You already have a depot here.' };
  if (campaign.treasury < WAREHOUSE_COST) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - WAREHOUSE_COST);
  campaign.ops.warehouses[cityId] = {
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
  const cost = restockCost(order);
  if (cost > campaign.treasury) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - cost);
  for (const unit of ['lemons', 'sugar', 'cups']) w.stock[unit] += order[unit] || 0;
  return { ok: true, cost };
}

export function restockCost(order) {
  const units = (order.lemons || 0) + (order.sugar || 0) + (order.cups || 0);
  const discount = bulkDiscount(units); // the whole order counts toward the break
  const raw =
    WHOLESALE.lemons * (order.lemons || 0) +
    WHOLESALE.sugar * (order.sugar || 0) +
    WHOLESALE.cups * (order.cups || 0);
  return Math.round(raw * discount * 100) / 100;
}

export function hireStaff(campaign, cityId, cornerIndex) {
  const ops = campaign.ops;
  if (!claimedIn(campaign, cityId).includes(cornerIndex)) {
    return { ok: false, why: 'You have not claimed that corner yet.' };
  }
  if (isStaffed(ops, cityId, cornerIndex)) return { ok: false, why: 'Already staffed.' };
  if (!hasWarehouse(ops, cityId)) return { ok: false, why: 'Build a depot in this city first.' };
  if (campaign.treasury < STAFF_HIRE_COST) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - STAFF_HIRE_COST);
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

/* ------------------------------------------------------------------ *
 * Time
 * ------------------------------------------------------------------ */

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Advance the network by `days` (one per day you played by hand). Corners
 * trade only as far as the depot can feed them; anything short goes on the
 * alert list rather than silently vanishing.
 */
export function tickOps(campaign, days) {
  const ops = campaign.ops;
  if (!ops) return null;
  const summary = { days, income: 0, costs: 0, cups: 0, stockUsed: { lemons: 0, sugar: 0, cups: 0 }, dry: [] };

  for (let d = 0; d < days; d++) {
    ops.day += 1;
    for (const cityData of CITIES) {
      const cityId = cityData.id;
      const staffed = staffedIn(ops, cityId);
      if (staffed.length === 0) continue;
      const w = ops.warehouses[cityId];
      const rng = mulberry32(ops.day * 7717 + cityId.length * 131);

      let dayCosts = (hasWarehouse(ops, cityId) ? WAREHOUSE_UPKEEP : 0) + staffed.length * STAFF_WAGE;
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
        dayIncome += look.price * canPour;
        dayCosts += look.iceCost * share + look.rent;
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
