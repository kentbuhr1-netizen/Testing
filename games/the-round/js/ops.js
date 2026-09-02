/**
 * The Round — the yard: depots, wholesale supply and second crews.
 *
 * Unlocked once five towns are complete. Rounds you already hold can be given
 * a standing crew, supplied with fuel and blades from a town yard, so they
 * keep earning while you work a new round yourself. Campaign days tick with
 * the days you work, so the firm grows exactly as fast as you do.
 *
 * Daylight is deliberately absent from the yard. Fuel and blades can be
 * stacked to the roof; hours cannot. A crew that runs out of day cannot bank
 * it and a bigger yard buys you none, which is why a second crew — not a
 * bigger order — is the only way to cut more grass. The same rule that shapes
 * the core game shapes the firm.
 */
import { TOWNS, getTown, roundsFor, heldIn, TIERS, mergeMods } from './campaign.js';
import { withMods, MINUTES_PER_UNIT, MINUTES_PER_SIZE, WORK_MINUTES } from './sim.js';

export const YARD_COST = 900;                // to open a yard in a town
export const YARD_BASE_CAPACITY = 4000;      // units of stock it can hold
export const CAPACITY_UPGRADE_COST = 700;
export const CAPACITY_UPGRADE_STEP = 3000;
export const CREW_HIRE_COST = 250;           // one-off, per round
export const CREW_WAGE = 95;                 // per crew per day
export const YARD_UPKEEP = 40;               // per yard per day

/** How well a standing crew works a round compared with you. */
export const CREW_EFFECT = 0.7;
/** What a crew manages once the yard behind it runs dry. */
export const UNSUPPLIED_EFFECT = 0.45;

/** Wholesale prices — cheaper than the forecourt, cheaper still by the pallet. */
export const WHOLESALE = { fuel: 1.35, blades: 9 };
const BULK_BREAKS = [
  { min: 4000, discount: 0.8 },
  { min: 1500, discount: 0.87 },
  { min: 500, discount: 0.94 },
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
    yards: {},        // townId → { capacity, stock: { fuel, blades } }
    crews: {},        // townId → [roundIndex]
    ledger: [],       // most recent days first
    alerts: [],
    totals: { takings: 0, costs: 0, lawns: 0 },
  };
}

export const hasYard = (ops, townId) => Boolean(ops?.yards?.[townId]);
export const crewsIn = (ops, townId) => ops?.crews?.[townId] || [];
export const isStaffed = (ops, townId, i) => crewsIn(ops, townId).includes(i);

export function stockTotal(yard) {
  if (!yard) return 0;
  return yard.stock.fuel + yard.stock.blades;
}

export function spaceLeft(yard) {
  return Math.max(0, yard.capacity - stockTotal(yard));
}

const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * What a standing crew does on an average day
 * ------------------------------------------------------------------ */

/**
 * Crews work an average day rather than a simulated one: no weather, no round
 * to plan, no client to read. They also route worse than an attentive owner —
 * that gap is what you are paid for when you work a round yourself.
 */
export function roundOutlook(townId, roundIndex) {
  const round = roundsFor(townId)[roundIndex];
  const townMods = getTown(townId).challenge.mods;
  const mods = withMods(mergeMods(TIERS[round.tier].mods, townMods, round.mods));

  const meanSize = 6.5 * mods.lawnSize;
  const mowMinutes = meanSize * MINUTES_PER_SIZE * mods.slope * 1.15;   // some overgrowth
  const driveMinutes = 34 * mods.spread * mods.travel * MINUTES_PER_UNIT;
  const perJob = mowMinutes + driveMinutes;

  const jobs = Math.max(0, (WORK_MINUTES * 0.9 / perJob) * CREW_EFFECT);
  const jobsDry = Math.max(0, (WORK_MINUTES * 0.9 / perJob) * UNSUPPLIED_EFFECT);
  const rate = (9 + meanSize * 3.1) * mods.rate;

  return {
    jobs,
    jobsDry,
    takings: round2(jobs * rate),
    takingsDry: round2(jobsDry * rate),
    fuel: Math.max(1, Math.round(jobs * 1.6)),          // litres a day
    blades: Math.max(1, Math.round(jobs * 0.16 * mods.dulling)),
    wage: CREW_WAGE,
  };
}

/** What the whole firm would do in one day, as a preview. */
export function networkOutlook(campaign) {
  const ops = campaign.ops;
  if (!ops) return null;
  let takings = 0, costs = 0, jobs = 0, crews = 0, fuel = 0, blades = 0;
  for (const town of TOWNS) {
    for (const i of crewsIn(ops, town.id)) {
      const o = roundOutlook(town.id, i);
      crews += 1;
      jobs += o.jobs;
      takings += o.takings;
      costs += o.wage;
      fuel += o.fuel;
      blades += o.blades;
    }
    if (hasYard(ops, town.id)) costs += YARD_UPKEEP;
  }
  return {
    crews,
    lawns: Math.round(jobs),
    takings: round2(takings),
    costs: round2(costs),
    net: round2(takings - costs),
    fuel,
    blades,
  };
}

/* ------------------------------------------------------------------ *
 * Opening and buying
 * ------------------------------------------------------------------ */

export function openYard(campaign, townId) {
  const ops = campaign.ops;
  if (hasYard(ops, townId)) return { ok: false, why: 'There is already a yard in this town.' };
  if (campaign.treasury < YARD_COST) return { ok: false, why: 'Not enough in the bank.' };
  campaign.treasury = round2(campaign.treasury - YARD_COST);
  ops.yards[townId] = { capacity: YARD_BASE_CAPACITY, stock: { fuel: 0, blades: 0 } };
  return { ok: true };
}

export function upgradeYard(campaign, townId) {
  const yard = campaign.ops?.yards?.[townId];
  if (!yard) return { ok: false, why: 'Open a yard here first.' };
  if (campaign.treasury < CAPACITY_UPGRADE_COST) return { ok: false, why: 'Not enough in the bank.' };
  campaign.treasury = round2(campaign.treasury - CAPACITY_UPGRADE_COST);
  yard.capacity += CAPACITY_UPGRADE_STEP;
  return { ok: true };
}

/**
 * Shut a yard. Nothing comes back — the point is to stop the upkeep.
 *
 * Without this a firm that over-extends has no way out: upkeep and wages are
 * owed every day whether or not anything is earning, and the bank just falls
 * forever. Closing is the brake.
 */
export function closeYard(campaign, townId) {
  const ops = campaign.ops;
  if (!hasYard(ops, townId)) return { ok: false, why: 'There is no yard here.' };
  if (crewsIn(ops, townId).length > 0) {
    return { ok: false, why: 'Lay off this town’s crews before closing its yard.' };
  }
  delete ops.yards[townId];
  return { ok: true };
}

export function buySupplies(campaign, townId, order) {
  const yard = campaign.ops?.yards?.[townId];
  if (!yard) return { ok: false, why: 'Open a yard here first.' };
  const units = (order.fuel || 0) + (order.blades || 0);
  if (units <= 0) return { ok: false, why: 'Nothing ordered.' };
  if (units > spaceLeft(yard)) return { ok: false, why: 'The yard cannot hold that much.' };
  const cost = restockCost(order);
  if (cost > campaign.treasury) return { ok: false, why: 'Not enough in the bank.' };
  campaign.treasury = round2(campaign.treasury - cost);
  yard.stock.fuel += order.fuel || 0;
  yard.stock.blades += order.blades || 0;
  return { ok: true, cost };
}

export function restockCost(order) {
  return round2(wholesaleCost('fuel', order.fuel || 0) + wholesaleCost('blades', order.blades || 0));
}

export function hireCrew(campaign, townId, roundIndex) {
  const ops = campaign.ops;
  if (!heldIn(campaign, townId).includes(roundIndex)) {
    return { ok: false, why: 'You do not hold that round.' };
  }
  if (isStaffed(ops, townId, roundIndex)) return { ok: false, why: 'Already crewed.' };
  if (campaign.treasury < CREW_HIRE_COST) return { ok: false, why: 'Not enough in the bank.' };
  campaign.treasury = round2(campaign.treasury - CREW_HIRE_COST);
  const list = ops.crews[townId] || (ops.crews[townId] = []);
  list.push(roundIndex);
  list.sort((a, b) => a - b);
  return { ok: true };
}

export function layOffCrew(campaign, townId, roundIndex) {
  const list = campaign.ops?.crews?.[townId];
  if (!list) return { ok: false, why: 'No crew there.' };
  const at = list.indexOf(roundIndex);
  if (at < 0) return { ok: false, why: 'No crew there.' };
  list.splice(at, 1);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * The daily tick
 * ------------------------------------------------------------------ */

/**
 * Run the firm for `days` days — one for every day you spent working a round
 * yourself. Wages and yard upkeep are owed whether or not the supplies were
 * there, so a yard that runs dry leaves crews on full pay doing half a job.
 */
export function runFirmDays(campaign, days) {
  const ops = campaign.ops;
  if (!ops || days <= 0) return null;

  const summary = { days, lawns: 0, takings: 0, costs: 0, fuel: 0, blades: 0, dry: [] };
  const dry = new Set();

  for (let d = 0; d < days; d++) {
    ops.day += 1;
    for (const town of TOWNS) {
      const crewed = crewsIn(ops, town.id);
      const yard = ops.yards[town.id];
      if (hasYard(ops, town.id)) summary.costs += YARD_UPKEEP;

      for (const i of crewed) {
        const o = roundOutlook(town.id, i);
        const supplied = yard && yard.stock.fuel >= o.fuel && yard.stock.blades >= o.blades;
        if (supplied) {
          yard.stock.fuel -= o.fuel;
          yard.stock.blades -= o.blades;
          summary.fuel += o.fuel;
          summary.blades += o.blades;
        } else {
          dry.add(town.id);
        }
        summary.lawns += supplied ? o.jobs : o.jobsDry;
        summary.takings += supplied ? o.takings : o.takingsDry;
        summary.costs += o.wage;      // owed either way
      }
    }
  }

  summary.lawns = Math.round(summary.lawns);
  summary.takings = round2(summary.takings);
  summary.costs = round2(summary.costs);
  summary.net = round2(summary.takings - summary.costs);
  summary.dry = [...dry];

  campaign.treasury = round2(campaign.treasury + summary.net);
  campaign.stats.lawnsCut += summary.lawns;
  ops.totals.takings = round2(ops.totals.takings + summary.takings);
  ops.totals.costs = round2(ops.totals.costs + summary.costs);
  ops.totals.lawns += summary.lawns;

  ops.alerts = summary.dry.map((id) => `${getTown(id).name}: the yard has run out. Crews are working on full pay.`);
  if (summary.net < 0) {
    ops.alerts.unshift(`The firm lost ${'$' + Math.abs(summary.net).toFixed(2)} over ${days} day${days === 1 ? '' : 's'}. Lay off crews or close a yard.`);
  }
  ops.ledger.unshift({ day: ops.day, ...summary });
  ops.ledger = ops.ledger.slice(0, 20);
  return summary;
}
