/**
 * Gadget Factory — the campaign.
 *
 * 25 factories, 25 contracts each. Contracts inside a factory ramp through
 * four difficulty tiers; factories themselves each bend the rules in one
 * distinctive way. Hold all 25 contracts and the factory is yours.
 *
 * Targets are not hand-written. Every contract's bar is derived from
 * `parProfit` — the extra profit the best of a family of reference policies
 * finds on that exact contract, with that factory's crew supply, grid and
 * demand — scaled by the tier. A fragile luxury build in a broke workshop
 * therefore gets an honestly lower bar than a forgiving staple in a rich
 * plant, without anyone balancing 625 numbers by hand.
 */
import { parProfit, mulberry32, PRODUCT_ARCHETYPES } from './sim.js';

export const CONTRACTS_PER_FACTORY = 25;
/**
 * How much of a factory you must hold before it counts as taken. Set to all
 * 25 contracts; lower it to shorten the campaign without touching anything else.
 */
export const CONTRACTS_TO_TAKE_FACTORY = CONTRACTS_PER_FACTORY;
export const FACTORIES_FOR_OPS = 5;   // the automation division unlocks once this many factories are done

/** Extra profit converts into automation division budget, $ for $. */
export const GRANT_PER_PROFIT = 0.06;

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export const TIERS = {
  easy: {
    id: 'easy', label: 'Easy', icon: '🟢', shifts: 10, cash: 45, parFactor: 0.4,
    blurb: 'A forgiving contract. Room to learn what the product actually needs.',
    mods: { crewSupply: 1.15, gridBase: 1.15 },
  },
  medium: {
    id: 'medium', label: 'Medium', icon: '🟡', shifts: 12, cash: 35, parFactor: 0.62,
    blurb: 'A fair fight. Every shift you waste is margin someone else keeps.',
    mods: {},
  },
  hard: {
    id: 'hard', label: 'Hard', icon: '🟠', shifts: 14, cash: 28, parFactor: 0.8,
    blurb: 'Thin capital, a tired crew, and a buyer who does not negotiate.',
    mods: { fatigue: 1.15, crewSupply: 0.9 },
  },
  impossible: {
    id: 'impossible', label: 'Impossible', icon: '🔴', shifts: 16, cash: 22, parFactor: 0.93,
    blurb: 'Near-perfect execution, or the line shuts down owing money.',
    mods: { fatigue: 1.3, crewSupply: 0.8, gridBase: 0.85 },
  },
};

/** Which tier each of a factory's 25 contracts belongs to. */
export const TIER_LAYOUT = [
  ...Array(7).fill('easy'),
  ...Array(7).fill('medium'),
  ...Array(7).fill('hard'),
  ...Array(4).fill('impossible'),
];

/* ------------------------------------------------------------------ *
 * Factories
 * ------------------------------------------------------------------ */

const factory = (id, name, chapter, icon, challenge) => ({ id, name, chapter, icon, challenge });

/** Shared naming pools — contracts are told apart by tier, quirk and product, not by a unique floor name. */
const FLOOR_POOL = ['Welding Bay', 'Paint Booth', 'Final Assembly', 'Quality Control', 'Packing Dock', 'Tool Crib', 'Wiring Bench', 'Fabrication Shop'];
const LINE_POOL = ['Line 1', 'Line 2', 'Night Line', 'Overflow Line', 'Pilot Line', 'Legacy Line'];

/**
 * Ordered gentlest-feeling to harshest, grouped into five chapters that climb
 * the product ladder from a garage to an orbital yard. `mods` are merged over
 * the tier's own, so a factory bends every contract in it the same way.
 * `scale` inside `challenge.mods` is what makes a chapter genuinely bigger
 * stakes than the last, not just a reskinned economy.
 */
export const FACTORIES = [
  // Chapter 1 — Bicycles
  factory('ironford', 'Ironford Frame Works', 'Bicycles', '🚲',
    { name: 'Garage Startup', blurb: 'Two benches, a welder, and a dream of frames that do not crack.',
      mods: { scale: 0.9, throughput: 0.9, crewSupply: 1.15, demand: 0.95 } }),
  factory('copperflats', 'Copper Flats Cycle Co.', 'Bicycles', '🔧',
    { name: 'Family Business', blurb: 'Three generations of the same five welds, done well.',
      mods: { scale: 1, defectRisk: 0.75, trust: 1.15 } }),
  factory('millrun', 'Millrun Cycleworks', 'Bicycles', '⚙️',
    { name: 'The Union Floor', blurb: 'Every overtime hour is a negotiation before it is a shift.',
      mods: { scale: 1, fatigue: 1.3, crewSupply: 1.1 } }),
  factory('brightbend', 'Brightbend Bicycles', 'Bicycles', '☀️',
    { name: 'Seasonal Demand', blurb: 'Everyone wants a bike in spring. Nobody wants one in November.',
      mods: { scale: 1, volatility: 0.35 } }),
  factory('saltmarsh', 'Saltmarsh Frame & Fender', 'Bicycles', '🌊',
    { name: 'Corrosion Country', blurb: 'The sea air finds a bad weld before the customer ever does.',
      mods: { scale: 1.1, defectRisk: 1.3, demand: 0.9 } }),

  // Chapter 2 — Scooters
  factory('duskyard', 'Duskyard Motors', 'Scooters', '🛵',
    { name: 'Night Shift City', blurb: 'The floor never really sleeps, and neither does the crew.',
      mods: { scale: 1.5, fatigue: 1.25, crewSupply: 1.1 } }),
  factory('thistledown', 'Thistledown Moped Works', 'Scooters', '🍃',
    { name: 'Cottage Industry, Grown Up', blurb: 'Outgrew the barn two years ago and still runs like it.',
      mods: { scale: 1.5, throughput: 0.85, defectRisk: 0.85 } }),
  factory('redgate', 'Redgate Scooter Co.', 'Scooters', '🚦',
    { name: 'Permit Trouble', blurb: 'Every inspector has an opinion about the wiring bay.',
      mods: { scale: 1.6, overtimeCost: 1.3, defectRisk: 1.15 } }),
  factory('cinderhall', 'Cinder Hall Assembly', 'Scooters', '🔥',
    { name: 'The Furnace Floor', blurb: 'Metalwork all day; the heat makes tempers short and hands slow.',
      mods: { scale: 1.6, fatigue: 1.4 } }),
  factory('quietbrook', 'Quietbrook Electric', 'Scooters', '🔋',
    { name: 'Battery Country', blurb: 'The good cells cost more, and the buyer can always tell the difference.',
      mods: { scale: 1.7, demand: 1.15, defectRisk: 0.9 } }),

  // Chapter 3 — Cars
  factory('forgeway', 'Forgeway Automotive', 'Cars', '🏗️',
    { name: 'The Assembly Line Proper', blurb: 'Robots on the heavy stations; people everywhere the robots cannot go.',
      mods: { scale: 2.4, throughput: 1.2, crewSupply: 0.85 } }),
  factory('harborcross', 'Harborcross Motorworks', 'Cars', '⚓',
    { name: 'Parts By Ship', blurb: 'Half the line waits on a container that is always a week out.',
      mods: { scale: 2.4, gridBase: 0.85 } }),
  factory('graniteridge', 'Graniteridge Vehicles', 'Cars', '🗻',
    { name: 'Old Money, Old Machines', blurb: 'The tooling is decades old and paid for. Replacing it is not on the table.',
      mods: { scale: 2.5, throughput: 0.9, defectRisk: 1.1 } }),
  factory('amberfield', 'Amberfield Auto Group', 'Cars', '🌾',
    { name: 'Right-to-Work Country', blurb: 'Crew is cheap and plentiful. Keeping them is the hard part.',
      mods: { scale: 2.6, crewSupply: 1.25, fatigue: 1.2 } }),
  factory('northlatch', 'Northlatch Coachworks', 'Cars', '❄️',
    { name: 'Winter Shutdown Risk', blurb: 'The grid strains hardest exactly when the orders are biggest.',
      mods: { scale: 2.7, gridBase: 0.8, volatility: 0.3 } }),

  // Chapter 4 — Drones
  factory('skylark', 'Skylark Robotics', 'Drones', '🛸',
    { name: 'High-Tech Lab', blurb: 'Every unit is a small research project that also has to ship on time.',
      mods: { scale: 3.4, demand: 1.25, defectRisk: 1.05 } }),
  factory('vantagepoint', 'Vantage Point Aerials', 'Drones', '📡',
    { name: 'The Regulator’s Favourite', blurb: 'The compliance paperwork alone could run a second factory.',
      mods: { scale: 3.4, overtimeCost: 1.4 } }),
  factory('clearwater', 'Clearwater Autonomy', 'Drones', '💧',
    { name: 'Clean Room Standards', blurb: 'One speck of dust and the whole batch is scrap.',
      mods: { scale: 3.5, defectRisk: 1.3, throughput: 0.85 } }),
  factory('ridgelineworks', 'Ridgeline Works', 'Drones', '⛰️',
    { name: 'Talent Drought', blurb: 'The engineers who understand the firmware are worth more than the building.',
      mods: { scale: 3.6, crewSupply: 0.75, demand: 1.1 } }),
  factory('brassfoundry', 'Brass Foundry Dronetech', 'Drones', '🔶',
    { name: 'Legacy Retrofit', blurb: 'Half the line still runs on tooling built for something else entirely.',
      mods: { scale: 3.7, throughput: 0.8 } }),

  // Chapter 5 — Spacecraft
  factory('orbitalyard', 'Orbital Yard One', 'Spacecraft', '🛰️',
    { name: 'Zero Margin For Error', blurb: 'A recall here does not mean a refund. It means a very public failure.',
      mods: { scale: 4.4, defectRisk: 1.4, demand: 1.3 } }),
  factory('cislunar', 'Cislunar Fabrication', 'Spacecraft', '🌙',
    { name: 'The Waiting Government Contract', blurb: 'The buyer pays superbly and audits everything twice.',
      mods: { scale: 4.6, overtimeCost: 1.5, demand: 1.2 } }),
  factory('ionfield', 'Ionfield Propulsion', 'Spacecraft', '⚡',
    { name: 'The Grid Cannot Keep Up', blurb: 'Every subsystem wants more power than the site has ever drawn.',
      mods: { scale: 4.7, gridBase: 0.7 } }),
  factory('deepvault', 'Deep Vault Systems', 'Spacecraft', '🕳️',
    { name: 'The Clean Build', blurb: 'Every fastener is logged. Every shortcut is a court case waiting to happen.',
      mods: { scale: 4.8, defectRisk: 1.2, crewSupply: 0.8 } }),
  factory('terminusworks', 'Terminus Works', 'Spacecraft', '🌌',
    { name: 'The Last Contract', blurb: 'Win this and the company’s name is on something that leaves the atmosphere.',
      mods: { scale: 5, demand: 1.4, defectRisk: 1.15, fatigue: 1.15 } }),
];

export const FACTORY_INDEX = Object.fromEntries(FACTORIES.map((f, i) => [f.id, i]));
export const getFactory = (id) => FACTORIES[FACTORY_INDEX[id]];

/* ------------------------------------------------------------------ *
 * Contracts
 * ------------------------------------------------------------------ */

/** Small local quirks, so no two contracts in a factory feel identical. */
const QUIRKS = [
  { id: 'plain', label: null, mods: {} },
  { id: 'apprentices', label: 'Apprentice crew', mods: { crewSupply: 0.8, defectRisk: 1.2 } },
  { id: 'veteranfloor', label: 'Veteran floor', mods: { defectRisk: 0.65, trust: 1.1 } },
  { id: 'automated', label: 'Heavily automated', mods: { throughput: 1.25, crewSupply: 0.7 } },
  { id: 'artisanal', label: 'Hand-built line', mods: { throughput: 0.75, demand: 1.2 } },
  { id: 'brownout', label: 'Weak grid connection', mods: { gridBase: 0.6 } },
  { id: 'subsidized', label: 'Subsidized contract', mods: { demand: 1.15, overtimeCost: 0.7 } },
  { id: 'rushorder', label: 'Standing rush order', mods: { rushOrders: 6, fatigue: 1.15 } },
];

const contractSeed = (factoryIdx, i) => (factoryIdx + 1) * 1_000_003 + (i + 1) * 7919;

/** The 25 contracts of a factory, always generated the same way. */
export function contractsFor(factoryId) {
  const factoryIdx = FACTORY_INDEX[factoryId];
  const out = [];
  for (let i = 0; i < CONTRACTS_PER_FACTORY; i++) {
    const rng = mulberry32(contractSeed(factoryIdx, i));
    const quirk = QUIRKS[Math.floor(rng() * QUIRKS.length)];
    const usePlace = rng() < 0.4;
    const name = usePlace
      ? LINE_POOL[Math.floor(rng() * LINE_POOL.length)]
      : `${FLOOR_POOL[Math.floor(rng() * FLOOR_POOL.length)]} ${rng() < 0.5 ? 'North' : 'South'}`;
    const archetype = PRODUCT_ARCHETYPES[Math.floor(rng() * PRODUCT_ARCHETYPES.length)];
    const scaleJitter = 0.8 + rng() * 0.5;
    out.push({
      index: i,
      factoryId,
      name: dedupeName(out, name, i),
      tier: TIER_LAYOUT[i],
      quirk: quirk.label,
      archetypeId: archetype.id,
      seed: contractSeed(factoryIdx, i),
      mods: mergeMods(quirk.mods, { scale: scaleJitter }),
    });
  }
  return out;
}

/** Two contracts in a factory sharing a name would be confusing on the map. */
function dedupeName(existing, name, i) {
  if (!existing.some((c) => c.name === name)) return name;
  return `${name} (${i + 1})`;
}

/** Multipliers multiply, shifts and flat bonuses add. */
export function mergeMods(...list) {
  const out = {};
  const additive = new Set(['rushOrders', 'rdDelay', 'volatility']);
  for (const mods of list) {
    for (const [key, value] of Object.entries(mods || {})) {
      if (additive.has(key)) out[key] = (out[key] ?? 0) + value;
      else out[key] = (out[key] ?? 1) * value;
    }
  }
  return out;
}

/** Everything sim.js needs to play one contract. */
export function runConfigFor(factoryId, contractIndex) {
  const f = getFactory(factoryId);
  const contract = contractsFor(factoryId)[contractIndex];
  const tier = TIERS[contract.tier];
  return {
    seed: contract.seed,
    shifts: tier.shifts,
    cash: tier.cash,
    archetypeId: contract.archetypeId,
    mods: mergeMods(tier.mods, f.challenge.mods, contract.mods),
    contract: { factoryId, index: contractIndex, name: contract.name, tier: contract.tier },
  };
}

/**
 * The extra profit you must clear to hold a contract: a share of what the
 * best reference policy finds there. Cached on the campaign so the bar never
 * moves under a player.
 */
export function targetFor(campaign, factoryId, contractIndex) {
  const key = `${factoryId}:${contractIndex}`;
  if (campaign?.targets?.[key] != null) return campaign.targets[key];
  const config = runConfigFor(factoryId, contractIndex);
  const tier = TIERS[contractsFor(factoryId)[contractIndex].tier];
  const par = parProfit(config);
  const target = Math.max(1, Math.round(par * tier.parFactor));
  if (campaign) {
    campaign.targets = campaign.targets || {};
    campaign.targets[key] = target;
  }
  return target;
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

/**
 * Which version of the model the cached targets were measured against. Bump
 * this whenever a change to `sim.js` moves par, and `migrateCampaign` drops
 * the stale bars, so each contract is re-measured the next time it is offered.
 */
export const TARGET_MODEL_VERSION = 1;

export function newCampaign() {
  return {
    version: 1,
    targetModel: TARGET_MODEL_VERSION,
    treasury: 0,        // automation division budget, $
    held: {},           // factoryId → array of held contract indexes
    targets: {},        // "factoryId:index" → the bar, cached once shown
    ops: null,          // built by ops.js once five factories are done
    stats: { runsPlayed: 0, runsWon: 0, extraProfit: 0 },
  };
}

/**
 * Bring a loaded campaign up to the current model. Only the cached targets
 * are dropped — contracts held, treasury, statistics and the automation
 * division all survive, because none of them is a claim about what a
 * contract asks for.
 */
export function migrateCampaign(campaign) {
  if (!campaign) return { cleared: 0, from: null };
  const from = campaign.targetModel ?? 1;
  if (from === TARGET_MODEL_VERSION) return { cleared: 0, from };

  const cleared = Object.keys(campaign.targets || {}).length;
  campaign.targets = {};
  campaign.targetModel = TARGET_MODEL_VERSION;
  return { cleared, from };
}

export const heldIn = (campaign, factoryId) => campaign.held[factoryId] || [];
export const isHeld = (campaign, factoryId, i) => heldIn(campaign, factoryId).includes(i);
export const factoryDone = (campaign, factoryId) =>
  heldIn(campaign, factoryId).length >= CONTRACTS_TO_TAKE_FACTORY;

export function completedFactories(campaign) {
  return FACTORIES.filter((f) => factoryDone(campaign, f.id)).map((f) => f.id);
}

/**
 * Is this factory inside the free tier? Purely positional, and deliberately
 * kept here with the rest of the progression rules rather than in the shop.
 */
export function isFactoryFree(factoryId, freeFactories) {
  return FACTORY_INDEX[factoryId] < freeFactories;
}

/** Factories open two at a time, so there is always somewhere else to go. */
export function isFactoryUnlocked(campaign, factoryId) {
  return FACTORY_INDEX[factoryId] <= completedFactories(campaign).length + 1;
}

/** Contracts are held in order, so the difficulty ramp holds. */
export function isContractUnlocked(campaign, factoryId, i) {
  if (!isFactoryUnlocked(campaign, factoryId)) return false;
  if (i === 0) return true;
  return isHeld(campaign, factoryId, i - 1);
}

export function nextContract(campaign, factoryId) {
  const held = heldIn(campaign, factoryId);
  for (let i = 0; i < CONTRACTS_PER_FACTORY; i++) if (!held.includes(i)) return i;
  return null;
}

/** Record a held contract. Returns what changed, for the celebration screen. */
export function holdContract(campaign, factoryId, i, extraProfit) {
  const before = factoryDone(campaign, factoryId);
  const list = campaign.held[factoryId] || (campaign.held[factoryId] = []);
  if (!list.includes(i)) list.push(i);
  list.sort((a, b) => a - b);
  campaign.treasury = Math.round((campaign.treasury + extraProfit * GRANT_PER_PROFIT) * 100) / 100;
  campaign.stats.extraProfit += Math.round(extraProfit);
  const factoryJustDone = !before && factoryDone(campaign, factoryId);
  const done = completedFactories(campaign).length;
  return {
    factoryJustDone,
    factoriesDone: done,
    opsJustUnlocked: factoryJustDone && done === FACTORIES_FOR_OPS,
  };
}

export const opsUnlocked = (campaign) => completedFactories(campaign).length >= FACTORIES_FOR_OPS;

export function campaignProgress(campaign) {
  const held = FACTORIES.reduce((n, f) => n + heldIn(campaign, f.id).length, 0);
  return {
    contracts: held,
    totalContracts: FACTORIES.length * CONTRACTS_PER_FACTORY,
    factories: completedFactories(campaign).length,
    totalFactories: FACTORIES.length,
  };
}

/* ------------------------------------------------------------------ *
 * Explaining a contract
 * ------------------------------------------------------------------ */

const NEUTRAL = {
  throughput: 1, trust: 1, fatigue: 1, defectRisk: 1, crewSupply: 1, gridBase: 1,
  demand: 1, overtimeCost: 1, rushOrders: 0, rdDelay: 0, volatility: 0, scale: 1,
};

/**
 * Turn merged modifiers into plain sentences. A player should be able to see
 * what a contract will do to them before they take it on.
 */
export function describeMods(mods) {
  const m = { ...NEUTRAL, ...mods };
  const out = [];
  const pct = (v) => `${Math.round(Math.abs(v - 1) * 100)}%`;

  if (m.throughput >= 1.15) out.push({ icon: '⚙️', text: `Well tooled — base output runs ${pct(m.throughput)} hotter.` });
  if (m.throughput <= 0.9) out.push({ icon: '🐌', text: `Aging tooling — base output runs ${pct(m.throughput)} cooler.` });
  if (m.crewSupply >= 1.15) out.push({ icon: '👷', text: `Deep labour pool — crew hires do ${pct(m.crewSupply)} more.` });
  if (m.crewSupply <= 0.85) out.push({ icon: '🧑‍🔧', text: `Thin labour pool — crew hires do ${pct(m.crewSupply)} less.` });
  if (m.fatigue >= 1.2) out.push({ icon: '😮‍💨', text: 'Morale burns fast here. Overtime will not sustain for long.' });
  if (m.trust >= 1.1) out.push({ icon: '🤝', text: 'A settled floor — morale recovers well on a quiet shift.' });
  if (m.defectRisk >= 1.2) out.push({ icon: '⚠️', text: `Defect-prone — rejects run ${pct(m.defectRisk)} higher than usual.` });
  if (m.defectRisk <= 0.8) out.push({ icon: '✅', text: `A careful floor — rejects run ${pct(m.defectRisk)} lower than usual.` });
  if (m.gridBase >= 1.15) out.push({ icon: '🔌', text: `Strong grid connection — ${pct(m.gridBase)} more capacity to start.` });
  if (m.gridBase <= 0.85) out.push({ icon: '🪫', text: `Weak grid connection — only ${Math.round(m.gridBase * 100)}% of the usual capacity.` });
  if (m.demand >= 1.15) out.push({ icon: '💰', text: `Strong demand — every unit sells for ${pct(m.demand)} more.` });
  if (m.demand <= 0.9) out.push({ icon: '📉', text: `Soft demand — every unit sells for ${pct(m.demand)} less.` });
  if (m.overtimeCost >= 1.3) out.push({ icon: '🧾', text: 'Overtime draws regulatory scrutiny here, whatever it produces.' });
  if (m.rushOrders >= 4) out.push({ icon: '🚚', text: 'A standing rush order adds flat revenue every shift.' });
  if (m.volatility >= 0.25) out.push({ icon: '🌊', text: 'Demand swings hard across the contract — time your push.' });
  if (m.scale >= 2.5) out.push({ icon: '🏭', text: 'A very large plant. Everything costs more, and pays more.' });
  if (m.scale <= 1) out.push({ icon: '🔧', text: 'A small operation. Everything costs less, and pays less.' });
  return out;
}
