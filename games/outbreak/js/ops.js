/**
 * Outbreak — the agency: regional laboratories, vaccine procurement and
 * standing response teams.
 *
 * Unlocked once five regions are complete. Districts you already hold can be
 * given a permanent response team, supplied with doses from a regional lab,
 * so they keep working while you take a new district by hand. Agency weeks
 * tick with the weeks you play, so the network runs exactly as fast as you do.
 *
 * Hospital beds are deliberately absent from the lab: a bed is a building,
 * not a crate, so stationed teams fund beds locally at whatever the district
 * charges. The same rule that shapes the core game shapes the agency.
 */
import {
  REGIONS, getRegion, districtsFor, heldIn, TIERS, mergeMods, GRANT_PER_LIFE,
} from './campaign.js';
import { withMods, BASE_POP, REF_POP } from './sim.js';

export const LAB_COST = 150;                 // $M to build a regional laboratory
export const LAB_BASE_CAPACITY = 400_000;    // doses it can hold
export const CAPACITY_UPGRADE_COST = 120;
export const CAPACITY_UPGRADE_STEP = 300_000;
export const TEAM_HIRE_COST = 25;            // one-off, per district
export const TEAM_WAGE = 0.9;                // per stationed team per week
export const LAB_UPKEEP = 0.4;               // per laboratory per week

/** How well a standing team performs against the outbreak it inherits. */
export const TEAM_EFFECT = 0.6;
/** What a team achieves once the lab behind it runs dry. */
export const UNSUPPLIED_EFFECT = 0.4;

/** Procurement prices — cheaper than emergency buying, cheaper still in bulk. */
export const WHOLESALE = { doses: 0.0004 };  // $M per dose
const BULK_BREAKS = [
  { min: 1_000_000, discount: 0.8 },
  { min: 500_000, discount: 0.87 },
  { min: 200_000, discount: 0.94 },
  { min: 0, discount: 1 },
];

export function bulkDiscount(qty) {
  return BULK_BREAKS.find((b) => qty >= b.min).discount;
}

export function wholesaleCost(qty) {
  return Math.round(WHOLESALE.doses * qty * bulkDiscount(qty) * 100) / 100;
}

export function newOps() {
  return {
    week: 0,
    labs: {},         // regionId → { capacity, doses }
    teams: {},        // regionId → [districtIndex]
    ledger: [],       // most recent weeks first
    alerts: [],
    totals: { grants: 0, costs: 0, saved: 0 },
  };
}

export const hasLab = (ops, regionId) => Boolean(ops?.labs?.[regionId]);
export const teamsIn = (ops, regionId) => ops?.teams?.[regionId] || [];
export const isStaffed = (ops, regionId, i) => teamsIn(ops, regionId).includes(i);

export function spaceLeft(lab) {
  return Math.max(0, lab.capacity - lab.doses);
}

/* ------------------------------------------------------------------ *
 * What a stationed team does in an average week
 * ------------------------------------------------------------------ */

/**
 * Teams work an average week rather than a simulated one: no pathogen to
 * learn, no weather of the mind. They also stop short of what an attentive
 * hand achieves — that gap is what you are paid for when you work a district
 * yourself.
 */
export function districtOutlook(regionId, districtIndex) {
  const district = districtsFor(regionId)[districtIndex];
  const regionMods = getRegion(regionId).challenge.mods;
  const mods = withMods(mergeMods(TIERS[district.tier].mods, regionMods, district.mods));

  const pop = Math.round(BASE_POP * mods.popScale);
  const scale = pop / REF_POP;

  // Deaths the district would suffer in an unmanaged week.
  const exposedDeaths = pop * 0.0009 * mods.density * mods.ageing;
  const saved = exposedDeaths * TEAM_EFFECT;
  const savedDry = exposedDeaths * UNSUPPLIED_EFFECT;

  return {
    pop,
    doses: Math.round(pop * 0.003),      // doses the team gets through each week
    beds: Math.round(0.6 * scale * 100) / 100,  // local bed spend, $M per week
    wage: TEAM_WAGE,
    saved,
    savedDry,
    grant: Math.round(saved * GRANT_PER_LIFE * 100) / 100,
  };
}

/** What the whole network would do in one week, as a preview. */
export function networkOutlook(campaign) {
  const ops = campaign.ops;
  if (!ops) return null;
  let saved = 0, grants = 0, costs = 0, doses = 0, teams = 0;
  for (const region of REGIONS) {
    for (const i of teamsIn(ops, region.id)) {
      const o = districtOutlook(region.id, i);
      teams += 1;
      saved += o.saved;
      grants += o.grant;
      costs += o.wage + o.beds;
      doses += o.doses;
    }
    if (hasLab(ops, region.id)) costs += LAB_UPKEEP;
  }
  return {
    teams,
    saved: Math.round(saved),
    grants: round2(grants),
    costs: round2(costs),
    net: round2(grants - costs),
    doses,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * Buying and building
 * ------------------------------------------------------------------ */

export function buildLab(campaign, regionId) {
  const ops = campaign.ops;
  if (hasLab(ops, regionId)) return { ok: false, why: 'This region already has a laboratory.' };
  if (campaign.treasury < LAB_COST) return { ok: false, why: 'Not enough budget.' };
  campaign.treasury = round2(campaign.treasury - LAB_COST);
  ops.labs[regionId] = { capacity: LAB_BASE_CAPACITY, doses: 0 };
  return { ok: true };
}

export function upgradeLab(campaign, regionId) {
  const lab = campaign.ops?.labs?.[regionId];
  if (!lab) return { ok: false, why: 'Build a laboratory here first.' };
  if (campaign.treasury < CAPACITY_UPGRADE_COST) return { ok: false, why: 'Not enough budget.' };
  campaign.treasury = round2(campaign.treasury - CAPACITY_UPGRADE_COST);
  lab.capacity += CAPACITY_UPGRADE_STEP;
  return { ok: true };
}

export function buyDoses(campaign, regionId, qty) {
  const lab = campaign.ops?.labs?.[regionId];
  if (!lab) return { ok: false, why: 'Build a laboratory here first.' };
  if (qty <= 0) return { ok: false, why: 'Nothing ordered.' };
  if (qty > spaceLeft(lab)) return { ok: false, why: 'The laboratory cannot hold that many.' };
  const cost = wholesaleCost(qty);
  if (cost > campaign.treasury) return { ok: false, why: 'Not enough budget.' };
  campaign.treasury = round2(campaign.treasury - cost);
  lab.doses += qty;
  return { ok: true, cost };
}

export function stationTeam(campaign, regionId, districtIndex) {
  const ops = campaign.ops;
  if (!heldIn(campaign, regionId).includes(districtIndex)) {
    return { ok: false, why: 'You do not hold that district.' };
  }
  if (isStaffed(ops, regionId, districtIndex)) return { ok: false, why: 'Already staffed.' };
  if (campaign.treasury < TEAM_HIRE_COST) return { ok: false, why: 'Not enough budget.' };
  campaign.treasury = round2(campaign.treasury - TEAM_HIRE_COST);
  const list = ops.teams[regionId] || (ops.teams[regionId] = []);
  list.push(districtIndex);
  list.sort((a, b) => a - b);
  return { ok: true };
}

export function standDownTeam(campaign, regionId, districtIndex) {
  const list = campaign.ops?.teams?.[regionId];
  if (!list) return { ok: false, why: 'No team there.' };
  const at = list.indexOf(districtIndex);
  if (at < 0) return { ok: false, why: 'No team there.' };
  list.splice(at, 1);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * The weekly tick
 * ------------------------------------------------------------------ */

/**
 * Run the network for `weeks` weeks — one for every week you spent working a
 * district by hand. Wages and upkeep are owed whether or not the doses turned
 * up, so a lab that runs dry leaves teams standing on full pay.
 */
export function runAgencyWeeks(campaign, weeks) {
  const ops = campaign.ops;
  if (!ops || weeks <= 0) return null;

  const summary = { weeks, saved: 0, grants: 0, costs: 0, doses: 0, dry: [] };
  const dry = new Set();

  for (let w = 0; w < weeks; w++) {
    ops.week += 1;
    for (const region of REGIONS) {
      const stationed = teamsIn(ops, region.id);
      const lab = ops.labs[region.id];
      if (hasLab(ops, region.id)) summary.costs += LAB_UPKEEP;

      for (const i of stationed) {
        const o = districtOutlook(region.id, i);
        const supplied = lab && lab.doses >= o.doses;
        if (supplied) {
          lab.doses -= o.doses;
          summary.doses += o.doses;
        } else if (stationed.length) {
          dry.add(region.id);
        }
        const saved = supplied ? o.saved : o.savedDry;
        summary.saved += saved;
        summary.grants += saved * GRANT_PER_LIFE;
        summary.costs += o.wage + o.beds;   // owed either way
      }
    }
  }

  summary.saved = Math.round(summary.saved);
  summary.grants = round2(summary.grants);
  summary.costs = round2(summary.costs);
  summary.net = round2(summary.grants - summary.costs);
  summary.dry = [...dry];

  campaign.treasury = round2(campaign.treasury + summary.net);
  campaign.stats.livesSaved += summary.saved;
  ops.totals.grants = round2(ops.totals.grants + summary.grants);
  ops.totals.costs = round2(ops.totals.costs + summary.costs);
  ops.totals.saved += summary.saved;

  ops.alerts = summary.dry.map((id) => `${getRegion(id).name}: the laboratory is out of doses.`);
  ops.ledger.unshift({ week: ops.week, ...summary });
  ops.ledger = ops.ledger.slice(0, 20);
  return summary;
}
