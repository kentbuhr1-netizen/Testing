/**
 * The Forge — the guild: city depots, stock buying and journeymen.
 *
 * Unlocked once five cities are complete. Workshops you already hold can be
 * given a journeyman, supplied with bar stock from a city depot, so they keep
 * turning out work while you take a new commission by hand. Guild shifts tick
 * with the shifts you work, so the network runs exactly as fast as you do.
 *
 * Heat is deliberately absent from the depot: a fire is not a crate, and no
 * shipment ever arrives warm. Journeymen buy their own coke locally at
 * whatever the city charges for it. The same rule that shapes the core game
 * shapes the guild.
 */
import {
  CITIES, getCity, heldIn, runConfigFor, CAPITAL_PER_PIECE,
} from './campaign.js';
import { DOCTRINES, playDoctrine, newRun, referenceLevels, simulateShift, commitShift, affordShift, withMods } from './sim.js';

export const DEPOT_COST = 150;               // £ to open a city depot
export const DEPOT_BASE_CAPACITY = 6_000;    // bars it can hold
export const CAPACITY_UPGRADE_COST = 120;
export const CAPACITY_UPGRADE_STEP = 4_000;
export const SMITH_HIRE_COST = 25;           // one-off, per workshop
export const SMITH_WAGE = 1.2;               // per stationed journeyman per shift
export const DEPOT_UPKEEP = 0.4;             // per depot per shift

/**
 * What a journeyman may do: anything in the reference family that does not
 * put your own hands on the hammer. Your hands are the one thing that cannot
 * be delegated, which is the hard limit on the guild — and the reason it can
 * never do what an attentive smith can.
 */
export const JOURNEY_DOCTRINES = DOCTRINES.filter((d) => d.hands === 0);

/** How much of that a standing shop actually captures. */
export const SMITH_EFFECT = 0.6;
/** What a journeyman turns out once the depot behind them runs dry. */
export const UNSUPPLIED_EFFECT = 0.4;

/** Stock prices — cheaper than buying by the bar, cheaper still by the ton. */
export const WHOLESALE = { bar: 0.004 };     // £ per bar
const BULK_BREAKS = [
  { min: 4_000, discount: 0.8 },
  { min: 2_000, discount: 0.87 },
  { min: 800, discount: 0.94 },
  { min: 0, discount: 1 },
];

export function bulkDiscount(qty) {
  return BULK_BREAKS.find((b) => qty >= b.min).discount;
}

export function wholesaleCost(qty) {
  return Math.round(WHOLESALE.bar * qty * bulkDiscount(qty) * 100) / 100;
}

export function newGuild() {
  return {
    shift: 0,
    depots: {},       // cityId → { capacity, bars }
    smiths: {},       // cityId → [workshopIndex]
    ledger: [],       // most recent shifts first
    alerts: [],
    totals: { capital: 0, costs: 0, pieces: 0 },
  };
}

export const hasDepot = (guild, cityId) => Boolean(guild?.depots?.[cityId]);
export const smithsIn = (guild, cityId) => guild?.smiths?.[cityId] || [];
export const isStaffed = (guild, cityId, i) => smithsIn(guild, cityId).includes(i);

export function spaceLeft(depot) {
  return Math.max(0, depot.capacity - depot.bars);
}

const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * What a stationed journeyman does in an average shift
 * ------------------------------------------------------------------ */

/**
 * A workshop's outlook never changes, and working it out means running a whole
 * commission, so it is worked out once and kept.
 */
const OUTLOOK_CACHE = new Map();

/**
 * Journeymen work an average shift rather than a simulated one: no metal to
 * learn, no weather of the mind. They also stop short of what an attentive
 * smith achieves — that gap is what you are paid for when you work a shop
 * yourself.
 *
 * What they are worth, though, is measured rather than assumed. The workshop's
 * own best hands-free run says what it can turn out in a shift, so a
 * journeyman standing over pattern-weld in Brescia is worth a great deal more
 * than one standing over mild steel in Bilbao — and some workshops do not make
 * enough to cover a wage at all. Deciding where they are worth stationing is
 * the whole of the guild.
 */
export function workshopOutlook(cityId, workshopIndex) {
  const key = `${cityId}:${workshopIndex}`;
  const cached = OUTLOOK_CACHE.get(key);
  if (cached) return cached;

  const config = runConfigFor(cityId, workshopIndex);
  const mods = withMods(config.mods);

  // The best a journeyman is allowed to do here, replayed so the bar stock it
  // gets through is measured off the same run as the work it turns out.
  let best = null;
  let bestPieces = -1;
  for (const doctrine of JOURNEY_DOCTRINES) {
    const pieces = playDoctrine(config, doctrine);
    if (pieces > bestPieces) { bestPieces = pieces; best = doctrine; }
  }
  const swings = swingsUnder(config, best);

  const pieces = (bestPieces / config.shifts) * SMITH_EFFECT;
  const out = Object.freeze({
    scale: mods.shopScale,
    bars: Math.max(1, Math.round((swings / config.shifts) * SMITH_EFFECT)),
    wage: round2(SMITH_WAGE * mods.shopScale),
    pieces,
    piecesDry: (bestPieces / config.shifts) * UNSUPPLIED_EFFECT,
    capital: round2(pieces * CAPITAL_PER_PIECE),
  });
  OUTLOOK_CACHE.set(key, out);
  return out;
}

/** Swings a whole commission takes under one doctrine — the stock it eats. */
function swingsUnder(config, doctrine) {
  const state = newRun(config);
  while (state.phase !== 'gameover') {
    affordShift(state);
    const hands = doctrine.hands * 0;      // a journeyman never has your hands
    state.levels = referenceLevels(state, doctrine, hands);
    state.hands = hands;
    commitShift(state, simulateShift(state));
  }
  return state.swungTotal;
}

/** What the whole network would do in one shift, as a preview. */
export function networkOutlook(campaign) {
  const guild = campaign.guild;
  if (!guild) return null;
  let pieces = 0, capital = 0, costs = 0, bars = 0, smiths = 0;
  for (const city of CITIES) {
    for (const i of smithsIn(guild, city.id)) {
      const o = workshopOutlook(city.id, i);
      smiths += 1;
      pieces += o.pieces;
      capital += o.capital;
      costs += o.wage;
      bars += o.bars;
    }
    if (hasDepot(guild, city.id)) costs += DEPOT_UPKEEP;
  }
  return {
    smiths,
    pieces: Math.round(pieces),
    capital: round2(capital),
    costs: round2(costs),
    net: round2(capital - costs),
    bars,
  };
}

/* ------------------------------------------------------------------ *
 * Building and buying
 * ------------------------------------------------------------------ */

export function buildDepot(campaign, cityId) {
  const guild = campaign.guild;
  if (hasDepot(guild, cityId)) return { ok: false, why: 'This city already has a depot.' };
  if (campaign.capital < DEPOT_COST) return { ok: false, why: 'Not enough capital.' };
  campaign.capital = round2(campaign.capital - DEPOT_COST);
  guild.depots[cityId] = { capacity: DEPOT_BASE_CAPACITY, bars: 0 };
  return { ok: true };
}

export function upgradeDepot(campaign, cityId) {
  const depot = campaign.guild?.depots?.[cityId];
  if (!depot) return { ok: false, why: 'Open a depot here first.' };
  if (campaign.capital < CAPACITY_UPGRADE_COST) return { ok: false, why: 'Not enough capital.' };
  campaign.capital = round2(campaign.capital - CAPACITY_UPGRADE_COST);
  depot.capacity += CAPACITY_UPGRADE_STEP;
  return { ok: true };
}

export function buyBars(campaign, cityId, qty) {
  const depot = campaign.guild?.depots?.[cityId];
  if (!depot) return { ok: false, why: 'Open a depot here first.' };
  if (qty <= 0) return { ok: false, why: 'Nothing ordered.' };
  if (qty > spaceLeft(depot)) return { ok: false, why: 'The depot cannot hold that much.' };
  const cost = wholesaleCost(qty);
  if (cost > campaign.capital) return { ok: false, why: 'Not enough capital.' };
  campaign.capital = round2(campaign.capital - cost);
  depot.bars += qty;
  return { ok: true, cost };
}

export function stationSmith(campaign, cityId, workshopIndex) {
  const guild = campaign.guild;
  if (!heldIn(campaign, cityId).includes(workshopIndex)) {
    return { ok: false, why: 'You do not hold that workshop.' };
  }
  if (isStaffed(guild, cityId, workshopIndex)) return { ok: false, why: 'Already staffed.' };
  if (campaign.capital < SMITH_HIRE_COST) return { ok: false, why: 'Not enough capital.' };
  campaign.capital = round2(campaign.capital - SMITH_HIRE_COST);
  const list = guild.smiths[cityId] || (guild.smiths[cityId] = []);
  list.push(workshopIndex);
  list.sort((a, b) => a - b);
  return { ok: true };
}

export function standDownSmith(campaign, cityId, workshopIndex) {
  const list = campaign.guild?.smiths?.[cityId];
  if (!list) return { ok: false, why: 'Nobody stationed there.' };
  const at = list.indexOf(workshopIndex);
  if (at < 0) return { ok: false, why: 'Nobody stationed there.' };
  list.splice(at, 1);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * The shift tick
 * ------------------------------------------------------------------ */

/**
 * Run the network for `shifts` shifts — one for every shift you spent at an
 * anvil yourself. Wages and upkeep are owed whether or not the stock turned
 * up, so a depot that runs dry leaves journeymen standing on full pay.
 */
export function runGuildShifts(campaign, shifts) {
  const guild = campaign.guild;
  if (!guild || shifts <= 0) return null;

  const summary = { shifts, pieces: 0, capital: 0, costs: 0, bars: 0, dry: [] };
  const dry = new Set();

  for (let s = 0; s < shifts; s++) {
    guild.shift += 1;
    for (const city of CITIES) {
      const stationed = smithsIn(guild, city.id);
      const depot = guild.depots[city.id];
      if (hasDepot(guild, city.id)) summary.costs += DEPOT_UPKEEP;

      for (const i of stationed) {
        const o = workshopOutlook(city.id, i);
        const supplied = depot && depot.bars >= o.bars;
        if (supplied) {
          depot.bars -= o.bars;
          summary.bars += o.bars;
        } else {
          dry.add(city.id);
        }
        const pieces = supplied ? o.pieces : o.piecesDry;
        summary.pieces += pieces;
        summary.capital += pieces * CAPITAL_PER_PIECE;
        summary.costs += o.wage;             // owed either way
      }
    }
  }

  summary.pieces = Math.round(summary.pieces);
  summary.capital = round2(summary.capital);
  summary.costs = round2(summary.costs);
  summary.net = round2(summary.capital - summary.costs);
  summary.dry = [...dry];

  campaign.capital = round2(campaign.capital + summary.net);
  campaign.stats.piecesMade += summary.pieces;
  guild.totals.capital = round2(guild.totals.capital + summary.capital);
  guild.totals.costs = round2(guild.totals.costs + summary.costs);
  guild.totals.pieces += summary.pieces;

  guild.alerts = summary.dry.map((id) => `${getCity(id).name}: the depot is out of bar stock.`);
  guild.ledger.unshift({ shift: guild.shift, ...summary });
  guild.ledger = guild.ledger.slice(0, 20);
  return summary;
}
