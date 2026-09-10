/**
 * Gadget Factory — shift simulation.
 *
 * A "run" is one contract at one factory: a product, a grid connection, a
 * crew, and a number of shifts to turn a seed of cash into as much extra
 * profit as the floor can give.
 *
 * The shift is the turn. Four levers fight each other exactly the way the
 * four levers in an outbreak fight each other: crew is a rental with no
 * memory, overtime is free and costs something else, R&D is slow and
 * permanent, and grid capacity is a building, not a crate — it has to be
 * staffed with upkeep for as long as it stands.
 *
 * Everything here is pure: give it a state object and it gives numbers back.
 * No DOM, no storage. campaign.js decides which contracts exist; app.js
 * draws them.
 */

/** Deterministic PRNG so a shift can be replayed (and unit tested). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ *
 * The four levers
 * ------------------------------------------------------------------ */

export const MAX_LEVEL = 5;
export const REF_SCALE = 1;          // costs and rates below are quoted at this factory size

export const BASE_THROUGHPUT = 30;   // units/shift a standard factory builds with zero investment
export const BASE_PRICE = 4;         // $ per unit before quality, demand and defects
export const BASE_GRID_RATE = 40;    // starting grid ceiling, standard factory
export const GRID_PER_LEVEL = 16;    // throughput ceiling added per grid level, standard factory
export const CREW_PER_LEVEL = 8;     // extra units/shift per crew level, before the grid caps it
export const RD_PER_LEVEL = 0.05;    // permanent price multiplier gained per R&D level, once certified
export const OVERTIME_PER_LEVEL = 0.08; // throughput multiplier per overtime level — the one way past the grid ceiling
export const OVERTIME_DRAIN = 0.07;  // morale lost per overtime level per shift
export const MORALE_REST = 0.05;     // morale regained per shift when overtime is off (or nearly)
export const DEFECT_SENSITIVITY = 0.5; // extra defect rate at zero morale

/** Weekly— per-shift cost of one level of each lever, in $ at REF_SCALE. */
export const LEVER_COST = {
  crew: 6,
  overtime: 0,     // free in cash, ruinous in morale
  rd: 11,
  grid: 13,
};

/**
 * Powering a grid connection already built, as a share of what it cost to
 * build it.
 *
 * Without this, grid capacity is a one-off purchase of a permanent asset: it
 * grows for free forever, and buying it on shift one dominates every other
 * lever by a wide margin. Upkeep is what gives capacity an opportunity cost,
 * so grid becomes a question of *when* rather than a free win.
 */
export const GRID_UPKEEP_SHARE = 0.22;
/** What one unit of grid capacity costs to build — the grid lever's price per unit. */
export const GRID_BUILD_COST_PER_UNIT = LEVER_COST.grid / GRID_PER_LEVEL;
/** What one built unit costs to keep powered each shift thereafter. */
export const GRID_UPKEEP_PER_UNIT = GRID_BUILD_COST_PER_UNIT * GRID_UPKEEP_SHARE;

/** Per-shift bill for the grid connection already standing. Never scaled: a line is a line. */
export function gridUpkeep(builtGrid) {
  return Math.round(builtGrid * GRID_UPKEEP_PER_UNIT * 100) / 100;
}

export const LEVERS = [
  { id: 'crew', label: 'Crew shift', icon: '👷',
    blurb: 'Bring on extra hands for the shift. Only as useful as the grid has spare capacity to run them.' },
  { id: 'overtime', label: 'Overtime', icon: '⏱️',
    blurb: 'Push the floor past its rated pace. Costs no budget — it costs the crew’s morale, and morale is what keeps defects down.' },
  { id: 'rd', label: 'R&D', icon: '🧪',
    blurb: 'Slow to certify and worthless if the contract ends first, but it raises what every unit sells for, for good.' },
  { id: 'grid', label: 'Grid capacity', icon: '🔌',
    blurb: 'Does nothing to output today. Decides how much crew and machinery you can ever run. Comes online next shift.' },
];

export const NO_LEVELS = { crew: 0, overtime: 0, rd: 0, grid: 0 };

/**
 * Per-shift bill for a set of levels, scaled to the factory's size, plus the
 * upkeep on the grid already built. Building grid capacity is charged once,
 * in the shift you fund it; powering it is charged every shift after.
 */
export function shiftSpend(levels, scale, builtGrid = 0) {
  return round2(
    (levels.crew * LEVER_COST.crew + levels.rd * LEVER_COST.rd + levels.grid * LEVER_COST.grid) * scale
    + builtGrid * GRID_UPKEEP_PER_UNIT
  );
}

/**
 * Trim a set of levels down to what `cash` can actually pay for.
 *
 * A programme that was affordable last shift can quietly stop being
 * affordable this shift once upkeep has grown. Rather than dead-end the
 * player on a disabled button, the dearest levers are given up first.
 * Overtime costs nothing and is never trimmed.
 */
export function affordLevels(levels, cash, scale, builtGrid = 0) {
  const out = { ...levels };
  for (const key of ['rd', 'grid', 'crew']) {   // dearest first
    while (out[key] > 0 && shiftSpend(out, scale, builtGrid) > cash) out[key] -= 1;
  }
  return out;
}

/**
 * Grid capacity the budget can no longer keep powered. Standing upkeep is the
 * one bill `affordLevels` cannot trim — a line is a line — so when upkeep
 * alone exceeds the cash on hand, exactly enough capacity goes dark to bring
 * it back within reach. Returns the units to close (0 when the cash covers them all).
 */
export function gridToClose(cash, builtGrid) {
  if (builtGrid <= 0 || gridUpkeep(builtGrid) <= cash) return 0;
  const shortfall = gridUpkeep(builtGrid) - Math.max(0, cash);
  return Math.min(builtGrid, Math.ceil(shortfall / GRID_UPKEEP_PER_UNIT * 100) / 100);
}

/**
 * Make this shift affordable, the one way the game allows: let capacity the
 * budget cannot power go dark, then trim the levers. Same rule for the player
 * and for the reference bots that set par. Mutates `state`; returns the grid
 * closed so the briefing can say so.
 */
export function affordShift(state) {
  const closed = gridToClose(state.cash, state.builtGrid);
  if (closed > 0) {
    state.builtGrid = round2(state.builtGrid - closed);
    state.gridCapacity = round2(Math.max(0, state.gridCapacity - closed));
  }
  state.levels = affordLevels(state.levels, state.cash, state.scale, state.builtGrid);
  return closed;
}

/* ------------------------------------------------------------------ *
 * Modifiers — every knob a factory, region or tier can turn
 * ------------------------------------------------------------------ */

export const NO_MODS = {
  throughput: 1,     // multiplies base production
  trust: 1,           // how readily morale recovers on a quiet shift
  fatigue: 1,         // how fast overtime burns morale
  defectRisk: 1,      // multiplies the archetype's baseline defect rate
  crewSupply: 1,       // how much a crew level actually adds
  gridBase: 1,          // grid capacity you start with
  demand: 1,             // multiplies revenue
  overtimeCost: 1,        // unused by the sim directly; read by describeMods for flavour
  rushOrders: 0,           // extra flat revenue per shift
  rdDelay: 0,               // extra shifts before R&D certifies
  volatility: 0,             // amplitude of a seasonal swing in demand
  scale: 1,                   // factory size
};

export function withMods(mods) {
  return { ...NO_MODS, ...(mods || {}) };
}

/* ------------------------------------------------------------------ *
 * Product archetypes
 *
 * `crewSensitivity` and `overtimeSensitivity` are the two hidden numbers the
 * whole contract turns on, and neither is ever printed. You infer them from
 * the weekly floor notes, the way you infer a recipe from a grumble.
 * ------------------------------------------------------------------ */

export const PRODUCT_ARCHETYPES = [
  { id: 'novelty', name: 'Novelty Fad', icon: '🎉',
    blurb: 'A viral must-have. Orders are enormous right now and gone by next season.',
    demandMult: [1.2, 1.5], defectBase: [0.01, 0.02],
    crewSensitivity: 0.5, overtimeSensitivity: 0.9, rdLag: 2, fadeRate: 0.05 },
  { id: 'staple', name: 'Staple Commodity', icon: '🔩',
    blurb: 'Unglamorous and steady. Nobody is thrilled to order it, and nobody stops either.',
    demandMult: [0.85, 1.05], defectBase: [0.015, 0.025],
    crewSensitivity: 1.1, overtimeSensitivity: 0.7, rdLag: 3, fadeRate: 0 },
  { id: 'luxury', name: 'Luxury Build', icon: '💎',
    blurb: 'The margin is superb, and the buyer notices every flaw.',
    demandMult: [1.4, 1.9], defectBase: [0.005, 0.012],
    crewSensitivity: 0.4, overtimeSensitivity: 1.3, rdLag: 5, fadeRate: 0 },
  { id: 'bulkorder', name: 'Bulk Contract', icon: '📦',
    blurb: 'Thin margins made up in volume. The floor lives or dies on raw throughput.',
    demandMult: [0.7, 0.9], defectBase: [0.03, 0.045],
    crewSensitivity: 1.3, overtimeSensitivity: 0.6, rdLag: 3, fadeRate: 0 },
  { id: 'precision', name: 'Precision Order', icon: '🛠️',
    blurb: 'Tolerances are tight. Push the floor and the rejects pile up fast.',
    demandMult: [1.1, 1.3], defectBase: [0.008, 0.015],
    crewSensitivity: 0.7, overtimeSensitivity: 1.6, rdLag: 2, fadeRate: 0 },
  { id: 'rushjob', name: 'Rush Job', icon: '⏱️',
    blurb: 'A tight deadline that pays well for speed. There is no time to certify anything.',
    demandMult: [1.0, 1.2], defectBase: [0.02, 0.03],
    crewSensitivity: 0.6, overtimeSensitivity: 0.5, rdLag: 6, fadeRate: 0.03 },
  { id: 'exportgrade', name: 'Export Grade', icon: '🚢',
    blurb: 'Papers, inspections, and a buyer who rejects the whole container for one bad unit.',
    demandMult: [1.15, 1.35], defectBase: [0.006, 0.014],
    crewSensitivity: 0.9, overtimeSensitivity: 1.1, rdLag: 3, fadeRate: 0 },
  { id: 'recallrisk', name: 'Recall Risk', icon: '⚠️',
    blurb: 'The design has a known weak point. One more shortcut and it is a recall, not a rejection.',
    demandMult: [0.9, 1.15], defectBase: [0.04, 0.06],
    crewSensitivity: 0.8, overtimeSensitivity: 1.8, rdLag: 2, fadeRate: 0 },
];

export const ARCHETYPE_INDEX = Object.fromEntries(PRODUCT_ARCHETYPES.map((a) => [a.id, a]));

/** Resolve an archetype into the exact product line this factory is running. */
export function rollArchetype(seed, archetypeId = null) {
  const rng = mulberry32((seed ^ 0x5f3759df) >>> 0);
  const arch = archetypeId
    ? ARCHETYPE_INDEX[archetypeId]
    : PRODUCT_ARCHETYPES[Math.floor(rng() * PRODUCT_ARCHETYPES.length)];
  const span = ([lo, hi]) => lo + rng() * (hi - lo);
  return {
    id: arch.id,
    name: arch.name,
    icon: arch.icon,
    blurb: arch.blurb,
    demandMult: Math.round(span(arch.demandMult) * 100) / 100,
    defectBase: span(arch.defectBase),
    crewSensitivity: arch.crewSensitivity,
    overtimeSensitivity: arch.overtimeSensitivity,
    rdLag: arch.rdLag,
    fadeRate: arch.fadeRate,
  };
}

/** How much of the launch demand is left by this shift. Fads fade; staples do not. */
export function demandFactor(archetype, shift) {
  return archetype.demandMult * Math.max(0.4, 1 - archetype.fadeRate * (shift - 1));
}

/* ------------------------------------------------------------------ *
 * Starting a run
 * ------------------------------------------------------------------ */

function rawRun({ seed, shifts = 12, cash = 40, mods = null, archetypeId = null, contract = null }) {
  const m = withMods(mods);
  const scale = m.scale;
  const archetype = rollArchetype(seed, archetypeId);

  return {
    seed, shift: 1, shifts, target: null, contract,
    mods: m, archetype, scale,
    cash: round2(cash * scale),
    startCash: round2(cash * scale),
    gridCapacity: round2(BASE_GRID_RATE * scale * m.gridBase),
    builtGrid: 0,
    gridQueue: 0,
    rdQueue: [],           // [{ shift, gain }] — R&D certifications that land later
    qualityMultiplier: 1,
    levels: { ...NO_LEVELS },
    morale: 1,
    history: [],
    phase: 'briefing',
    baselineProfit: 0,
  };
}

export function newRun(config = {}) {
  const state = rawRun(config);
  state.target = config.target ?? null;
  state.baselineByShift = baselineTrajectory(config);
  state.baselineProfit = state.baselineByShift[state.baselineByShift.length - 1] ?? 0;
  return state;
}

/** Extra profit so far, against where doing nothing would have left you by now. */
export function extraSoFar(state) {
  const profitNow = round2(state.cash - state.startCash);
  if (!state.baselineByShift) return Math.max(0, profitNow - state.baselineProfit);
  const at = Math.min(state.shift - 1, state.baselineByShift.length) - 1;
  const reference = at >= 0 ? state.baselineByShift[at] : 0;
  return Math.max(0, round2(profitNow - reference));
}

/* ------------------------------------------------------------------ *
 * The shift
 * ------------------------------------------------------------------ */

/** How much spare grid capacity exists before crew is added. */
export function headroom(state) {
  const base = BASE_THROUGHPUT * state.scale * state.mods.throughput;
  return Math.max(0, state.gridCapacity - base);
}

/** What a crew level actually adds — capped by whatever the grid has spare. */
export function crewGain(state, level) {
  const wanted = CREW_PER_LEVEL * state.scale * level * state.archetype.crewSensitivity * state.mods.crewSupply;
  return Math.max(0, Math.min(wanted, headroom(state)));
}

/** Overtime's multiplier on output — the one lever that can push past the grid ceiling. */
export function overtimeGain(level) {
  return 1 + OVERTIME_PER_LEVEL * level;
}

/** Morale burned this shift by running overtime, before any rest is credited back. */
export function moraleDrain(state, level) {
  return OVERTIME_DRAIN * level * state.archetype.overtimeSensitivity * state.mods.fatigue;
}

/** Share of output rejected this shift — the archetype's own risk, worse the lower morale runs. */
export function defectRate(state, level) {
  const restless = clamp(1 - state.morale, 0, 1);
  return clamp(state.archetype.defectBase * state.mods.defectRisk + restless * DEFECT_SENSITIVITY, 0, 0.85);
}

/**
 * Run the shift. Pure: reads the state and the levels already set on it and
 * returns a report, including the cash it ends on. `commitShift` is what
 * writes any of it back.
 */
export function simulateShift(state) {
  const m = state.mods;
  const a = state.archetype;
  const L = state.levels;
  const rng = mulberry32(state.seed + state.shift * 104729 + 17);

  const gridCapacity = round2(state.gridCapacity + state.gridQueue);
  const base = BASE_THROUGHPUT * state.scale * m.throughput;
  const crew = crewGain(state, L.crew);
  const capped = Math.min(base + crew, gridCapacity);
  const otMult = overtimeGain(L.overtime);
  const wobble = 1 + m.volatility * Math.sin((state.shift / state.shifts) * Math.PI * 2) + (rng() * 0.1 - 0.05);
  const production = Math.max(0, capped * otMult * wobble);

  const defect = defectRate(state, L.overtime);
  const demand = demandFactor(a, state.shift);
  const price = BASE_PRICE * demand * m.demand * state.qualityMultiplier * (1 - defect);
  const revenue = round2(production * price + m.rushOrders * state.scale);
  const spend = shiftSpend(L, state.scale, state.builtGrid);

  const matured = state.rdQueue
    .filter((q) => q.shift <= state.shift)
    .reduce((n, q) => n + q.gain, 0);

  const rest = L.overtime <= 1 ? MORALE_REST * m.trust : 0;
  const drain = moraleDrain(state, L.overtime);
  const moraleDelta = clamp(-drain + rest, -0.4, 0.15);

  return {
    shift: state.shift,
    levels: { ...L },
    gridCapacity, production: Math.round(production), demand, defect,
    headroom: headroom(state),
    revenue, spend, moraleDelta,
    matured, maturesAt: state.shift + a.rdLag + m.rdDelay,
    next: { cash: round2(state.cash - spend + revenue) },
    revenueShown: Math.round(revenue),
  };
}

/** Apply a simulated shift to the state and move the calendar forward. */
export function commitShift(state, result) {
  Object.assign(state, result.next);

  state.gridCapacity = round2(state.gridCapacity + state.gridQueue);
  state.builtGrid = round2(state.builtGrid + state.gridQueue);
  state.gridQueue = round2(state.scale * GRID_PER_LEVEL * state.levels.grid);

  state.rdQueue = state.rdQueue.filter((q) => q.shift > state.shift);
  if (result.levels.rd > 0) {
    state.rdQueue.push({ shift: result.maturesAt, gain: RD_PER_LEVEL * result.levels.rd });
  }
  if (result.matured > 0) state.qualityMultiplier = round2(state.qualityMultiplier + result.matured);

  // Capacity you cannot keep powered goes dark instead of running up a debt.
  // `affordShift` should have kept the books balanced before the shift ran;
  // this is the safety net for a shift that still ended in the red. Closures
  // refund exactly the upkeep they save and not a penny more — a shortfall
  // that outlives every line stays owed, for the bots exactly as for the player.
  result.gridClosed = 0;
  if (state.cash < 0 && state.builtGrid > 0) {
    const closed = Math.min(state.builtGrid, -state.cash / GRID_UPKEEP_PER_UNIT);
    state.builtGrid = round2(state.builtGrid - closed);
    state.gridCapacity = round2(Math.max(0, state.gridCapacity - closed));
    state.cash = round2(state.cash + closed * GRID_UPKEEP_PER_UNIT);
    result.gridClosed = closed;
  }
  state.morale = clamp(state.morale + result.moraleDelta, 0.1, 1);

  result.notes = floorNotes(state, result);
  state.history.push(result);
  state.shift += 1;
  state.phase = state.shift > state.shifts ? 'gameover' : 'briefing';
  return state;
}

/**
 * What the shift taught you. Deliberately qualitative — the hidden traits are
 * never printed, so you read them off the floor instead.
 */
function floorNotes(state, result) {
  const a = state.archetype;
  const L = result.levels;
  const notes = [];

  if (L.crew >= 2 && result.headroom < CREW_PER_LEVEL * state.scale * 0.5) {
    notes.push('The floor has no spare grid capacity for more hands. Extra crew stood around.');
  }
  if (L.overtime >= 3 && result.defect > 0.15) {
    notes.push('Rejects are piling up. The floor cannot sustain this pace for long.');
  }
  if (state.morale < 0.4) {
    notes.push('Morale is gone. Calling it "overtime" is generous at this point.');
  } else if (result.moraleDelta < -0.1) {
    notes.push('The crew is tiring of the pace.');
  }
  if (result.gridClosed > 1) {
    notes.push(`${result.gridClosed.toFixed(1)} units of grid capacity went dark — there was no cash to keep them powered.`);
  }
  if (result.matured > 1e-9) {
    notes.push('A quality certification just landed. Every unit sells for more from here.');
  } else if (L.rd > 0 && state.rdQueue.length > 0) {
    const next = Math.min(...state.rdQueue.map((q) => q.shift));
    notes.push(`R&D is in the pipeline, but nothing certifies until shift ${next}.`);
  }
  if (a.fadeRate > 0 && result.demand < a.demandMult * 0.75) {
    notes.push('Demand is fading. This will not stay this hot for long.');
  }
  if (notes.length === 0) {
    notes.push(result.revenue > 0 ? 'An ordinary shift on the floor.' : 'Nothing moved this shift.');
  }
  return notes.slice(0, 4);
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/**
 * Cumulative extra profit, shift by shift, if nobody touches a single lever.
 * The last entry is the bar the whole contract is measured from; the earlier
 * ones let the HUD show progress as you go rather than only at the end.
 */
export function baselineTrajectory(config) {
  const state = rawRun(config);
  const out = [];
  while (state.phase !== 'gameover') {
    state.levels = { ...NO_LEVELS };
    commitShift(state, simulateShift(state));
    out.push(round2(state.cash - state.startCash));
  }
  return out;
}

/** Profit if nobody touches a lever at all — the bar every run is measured from. */
export function baselineProfitOf(config) {
  const t = baselineTrajectory(config);
  return t[t.length - 1] ?? 0;
}

export function extraProfit(state) {
  return Math.max(0, round2(round2(state.cash - state.startCash) - state.baselineProfit));
}

export function finalScore(state) {
  const profit = round2(state.cash - state.startCash);
  const extra = extraProfit(state);
  const shareOfBaseline = state.baselineProfit > 0 ? extra / state.baselineProfit : (extra > 0 ? 1 : 0);
  return {
    profit,
    baselineProfit: round2(state.baselineProfit),
    extra,
    cashLeft: round2(state.cash),
    morale: state.morale,
    target: state.target,
    won: state.target == null ? null : extra >= state.target,
    rank: rankFor(shareOfBaseline),
  };
}

function rankFor(share) {
  if (share >= 1.5) return { title: 'Flagship Line', icon: '🏭' };
  if (share >= 0.9) return { title: 'Well Oiled', icon: '⚙️' };
  if (share >= 0.5) return { title: 'Turning a Profit', icon: '📈' };
  if (share >= 0.2) return { title: 'Breaking Even', icon: '⚖️' };
  if (share >= 0.05) return { title: 'Bleeding Cash', icon: '📉' };
  return { title: 'Shuttered', icon: '🔧' };
}

/* ------------------------------------------------------------------ *
 * Reference play
 *
 * A bot used to set each contract's target ("par"). It plays a small family
 * of policies against the contract's own product, size and starting cash and
 * keeps the best. Because the search happens on the contract itself, the
 * target is calibrated automatically — a fragile luxury build in a broke
 * factory gets an honestly lower bar than a forgiving staple in a rich one,
 * without anyone balancing 625 numbers by hand.
 * ------------------------------------------------------------------ */

/**
 * The knobs the reference bot searches over.
 *
 * The family has to contain the best play available, or par understates what
 * a contract can give and the targets come out too soft. It must therefore
 * span the levers at full strength, and — because building grid early and
 * holding it is a genuinely different policy from building it once headroom
 * runs out — both sides of that timing question.
 */
export const POLICIES = (() => {
  const out = [];
  for (const overtime of [0, 2, 3, 5]) {
    for (const rd of [0, 3, MAX_LEVEL]) {
      for (const grid of [0, 3, MAX_LEVEL]) {
        // Nothing to time if you never build capacity.
        for (const gridEarly of grid === 0 ? [false] : [true, false]) {
          for (const crewOn of [true, false]) {
            // Nothing to prioritise if you never hire a crew.
            for (const crewFirst of crewOn ? [true, false] : [false]) {
              out.push({ overtime, rd, grid, gridEarly, crewOn, crewFirst });
            }
          }
        }
      }
    }
  }
  return out;
})();

/** What the reference bot would do this shift under `policy`. */
export function referenceLevels(state, policy) {
  const shiftsLeft = state.shifts - state.shift;
  const want = {
    crew: policy.crewOn && headroom(state) > 0 ? MAX_LEVEL : 0,
    overtime: state.morale > 0.3 ? policy.overtime : 0,
    rd: shiftsLeft >= (state.archetype.rdLag + state.mods.rdDelay) ? policy.rd : 0,
    grid: policy.gridEarly || headroom(state) < 1 ? policy.grid : 0,
  };

  // Trim to what the cash covers, in priority order.
  const order = policy.crewFirst ? ['crew', 'grid', 'rd'] : ['grid', 'crew', 'rd'];
  const levels = { crew: 0, overtime: want.overtime, rd: 0, grid: 0 };
  for (const key of order) {
    for (let n = want[key]; n > 0; n--) {
      const trial = { ...levels, [key]: n };
      if (shiftSpend(trial, state.scale, state.builtGrid) <= state.cash) { levels[key] = n; break; }
    }
  }
  return levels;
}

/** Play a whole contract under one policy and report the profit it ended with. */
export function playPolicy(config, policy) {
  const state = rawRun(config);
  state.baselineProfit = 0;
  while (state.phase !== 'gameover') {
    affordShift(state);                      // the bots power down exactly as the player must
    state.levels = referenceLevels(state, policy);
    commitShift(state, simulateShift(state));
  }
  return round2(state.cash - state.startCash);
}

/**
 * Extra profit the best policy in the family finds on this contract.
 * This is what contract targets are measured against.
 */
export function parProfit(config) {
  const baseline = baselineProfitOf(config);
  let best = baseline;
  for (const policy of POLICIES) {
    const profit = playPolicy(config, policy);
    if (profit > best) best = profit;
  }
  return Math.max(0, round2(best - baseline));
}
