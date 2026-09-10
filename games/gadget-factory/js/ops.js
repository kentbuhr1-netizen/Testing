/**
 * Gadget Factory — regional offices.
 *
 * Once two product lines have had a first prestige, a tier you have moved on
 * from does not have to sit idle: hire managers to keep its floor running
 * while you work the current tier by hand. Offices tick in real hours, the
 * same hours that pass while you are away or actively playing elsewhere.
 *
 * Components are the one thing a regional office can stockpile — bought in
 * bulk into a shared warehouse and drawn down as managers use them. Grid
 * power is not: each office runs on its own tier's local connection, capped
 * well below what an actively managed floor could reach, and there is no way
 * to ship spare capacity from one tier's grid to another's. A manager left
 * without components still draws a wage; a manager left without power simply
 * has none to draw on, ever, from anywhere else.
 */
import { TIERS, TIER_INDEX, getTier } from './campaign.js';
import { prestigeMultiplier } from './sim.js';

const round2 = (n) => Math.round(n * 100) / 100;

export const OFFICE_HIRE_COST_BASE = 400;      // scales with the tier's position in the ladder
export const MANAGER_COST_BASE = 250;
export const MANAGER_COST_GROWTH = 1.6;
export const MANAGER_WAGE = 3;                  // $ per manager, per office-hour, owed regardless of supply
export const MAX_MANAGERS_PER_OFFICE = 6;

export const WAREHOUSE_BASE_CAPACITY = 6000;
export const WAREHOUSE_UPGRADE_COST = 900;
export const WAREHOUSE_CAPACITY_STEP = 5000;
export const COMPONENT_WHOLESALE = 0.06;         // $ per component before bulk discount
export const COMPONENTS_PER_MANAGER_HOUR = 30;   // what a supplied manager burns per office-hour

export const MANAGER_OUTPUT_SHARE = 0.14;        // share of a tier's base grid one manager can drive
export const OFFICE_CAPACITY_SHARE = 0.55;       // an unattended floor never matches an actively managed one
export const UNSUPPLIED_EFFECT = 0.5;            // what a dry office still manages on its own

const BULK_BREAKS = [
  { min: 200_000, discount: 0.78 },
  { min: 50_000, discount: 0.87 },
  { min: 10_000, discount: 0.94 },
  { min: 0, discount: 1 },
];

export function bulkDiscount(qty) {
  return BULK_BREAKS.find((b) => qty >= b.min).discount;
}

export function wholesaleCost(qty) {
  return round2(COMPONENT_WHOLESALE * qty * bulkDiscount(qty));
}

export function newOps() {
  return {
    hours: 0,
    offices: {},                                          // tierId → { managers }
    warehouse: { capacity: WAREHOUSE_BASE_CAPACITY, components: 0 },
    ledger: [],
    alerts: [],
    totals: { income: 0, costs: 0 },
  };
}

export const hasOffice = (ops, tierId) => Boolean(ops?.offices?.[tierId]);
export const managersAt = (ops, tierId) => ops?.offices?.[tierId]?.managers ?? 0;
export const spaceLeft = (warehouse) => Math.max(0, warehouse.capacity - warehouse.components);

/** What one more manager at this tier's office would cost. */
export function managerCost(tierIndex, owned) {
  return round2(MANAGER_COST_BASE * (tierIndex + 1) * Math.pow(MANAGER_COST_GROWTH, owned));
}

export function officeHireCost(tierIndex) {
  return round2(OFFICE_HIRE_COST_BASE * (tierIndex + 1));
}

/**
 * What a given number of managers is worth per office-hour, on this tier,
 * given the lifetime cash driving the current prestige multiplier. Never
 * more than `OFFICE_CAPACITY_SHARE` of the tier's grid — an unattended floor
 * cannot match one somebody is actually running.
 */
export function officeOutlook(tier, managers, lifetimeCash) {
  const capacity = tier.baseGrid * OFFICE_CAPACITY_SHARE;
  const raw = Math.min(managers * tier.baseGrid * MANAGER_OUTPUT_SHARE, capacity);
  const price = tier.basePrice * prestigeMultiplier(lifetimeCash);
  return {
    income: round2(raw * price),
    incomeDry: round2(raw * price * UNSUPPLIED_EFFECT),
    componentsPerHour: managers * COMPONENTS_PER_MANAGER_HOUR,
    wage: managers * MANAGER_WAGE,
  };
}

/* ------------------------------------------------------------------ *
 * Buying and building
 * ------------------------------------------------------------------ */

export function buildOffice(campaign, tierId) {
  const ops = campaign.ops;
  const tierIndex = TIER_INDEX[tierId];
  if (hasOffice(ops, tierId)) return { ok: false, why: 'This tier already has an office.' };
  const cost = officeHireCost(tierIndex);
  if (campaign.treasury < cost) return { ok: false, why: 'Not enough treasury.' };
  campaign.treasury = round2(campaign.treasury - cost);
  ops.offices[tierId] = { managers: 0 };
  return { ok: true, cost };
}

export function hireManager(campaign, tierId) {
  const ops = campaign.ops;
  const office = ops?.offices?.[tierId];
  if (!office) return { ok: false, why: 'Build an office here first.' };
  if (office.managers >= MAX_MANAGERS_PER_OFFICE) return { ok: false, why: 'This office is fully staffed.' };
  const cost = managerCost(TIER_INDEX[tierId], office.managers);
  if (campaign.treasury < cost) return { ok: false, why: 'Not enough treasury.' };
  campaign.treasury = round2(campaign.treasury - cost);
  office.managers += 1;
  return { ok: true, cost };
}

export function layoffManager(campaign, tierId) {
  const office = campaign.ops?.offices?.[tierId];
  if (!office || office.managers <= 0) return { ok: false, why: 'No manager to lay off.' };
  office.managers -= 1;
  return { ok: true };
}

export function upgradeWarehouse(campaign) {
  const ops = campaign.ops;
  if (campaign.treasury < WAREHOUSE_UPGRADE_COST) return { ok: false, why: 'Not enough treasury.' };
  campaign.treasury = round2(campaign.treasury - WAREHOUSE_UPGRADE_COST);
  ops.warehouse.capacity += WAREHOUSE_CAPACITY_STEP;
  return { ok: true };
}

export function buyComponents(campaign, qty) {
  const ops = campaign.ops;
  if (qty <= 0) return { ok: false, why: 'Nothing ordered.' };
  if (qty > spaceLeft(ops.warehouse)) return { ok: false, why: 'The warehouse cannot hold that many.' };
  const cost = wholesaleCost(qty);
  if (cost > campaign.treasury) return { ok: false, why: 'Not enough treasury.' };
  campaign.treasury = round2(campaign.treasury - cost);
  ops.warehouse.components += qty;
  return { ok: true, cost };
}

/* ------------------------------------------------------------------ *
 * The hourly tick
 * ------------------------------------------------------------------ */

/** What the whole network is worth right now, as a preview. */
export function networkOutlook(campaign) {
  const ops = campaign.ops;
  if (!ops) return null;
  let income = 0, costs = 0, managers = 0;
  for (const tierId of Object.keys(ops.offices)) {
    const office = ops.offices[tierId];
    if (office.managers <= 0) continue;
    const o = officeOutlook(getTier(tierId), office.managers, campaign.lifetimeCash);
    managers += office.managers;
    income += o.income;
    costs += o.wage;
  }
  return { managers, income: round2(income), costs: round2(costs), net: round2(income - costs) };
}

/**
 * Run the network for `hours` real hours. Wages are owed whether or not the
 * components turned up, so a warehouse that runs dry leaves managers on full
 * pay doing a worse job.
 */
export function runOfficeHours(campaign, hours) {
  const ops = campaign.ops;
  if (!ops || hours <= 0) return null;

  const summary = { hours, income: 0, costs: 0, components: 0, dry: [] };
  const dry = new Set();

  for (let h = 0; h < hours; h++) {
    ops.hours += 1;
    for (const tierId of Object.keys(ops.offices)) {
      const office = ops.offices[tierId];
      if (office.managers <= 0) continue;
      const o = officeOutlook(getTier(tierId), office.managers, campaign.lifetimeCash);
      const supplied = ops.warehouse.components >= o.componentsPerHour;
      if (supplied) {
        ops.warehouse.components -= o.componentsPerHour;
        summary.components += o.componentsPerHour;
      } else {
        dry.add(tierId);
      }
      summary.income += supplied ? o.income : o.incomeDry;
      summary.costs += o.wage;    // owed either way
    }
  }

  summary.income = round2(summary.income);
  summary.costs = round2(summary.costs);
  summary.net = round2(summary.income - summary.costs);
  summary.dry = [...dry];

  campaign.treasury = round2(campaign.treasury + summary.net);
  ops.totals.income = round2(ops.totals.income + summary.income);
  ops.totals.costs = round2(ops.totals.costs + summary.costs);

  ops.alerts = summary.dry.map((id) => `${getTier(id).name}: the warehouse is out of components.`);
  ops.ledger.unshift({ hour: ops.hours, ...summary });
  ops.ledger = ops.ledger.slice(0, 20);
  return summary;
}
