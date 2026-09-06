/**
 * The Forge — shift simulation.
 *
 * A "run" is one commission at one workshop: an alloy, a shop, a purse, and a
 * number of finished pieces you have to deliver before the shifts run out.
 *
 * The shift is the turn, but the fire is simulated an hour at a time inside
 * it, because heat is the whole game. You set four levers, decide how much of
 * the work you are doing with your own hands, and watch eight hours run.
 *
 * The one thing that can never be stockpiled is heat. The fire dies overnight,
 * every night, in every workshop, and no amount of money buys a hot forge at
 * the start of a shift — which is what stops the guild replacing the anvil.
 *
 * Everything here is pure: give it a state object and it gives numbers back.
 * No DOM, no storage. campaign.js decides which commissions exist; app.js
 * draws them.
 */

export const TICKS_PER_SHIFT = 8;      // an eight-hour shift, worked hour by hour
export const START_HEAT = 0.2;         // what is left of last night's fire
export const MAX_HEAT = 1.4;
export const START_MORALE = 0.8;

/**
 * Where the fire settles, per notch of the bellows, once nothing is being
 * struck. Ten notches span every working heat in the book with room over the
 * hottest of them, and a notch is finer than the narrowest alloy's window —
 * which is what makes finding the right one a real question.
 */
export const HEAT_PER_NOTCH = 0.14;
/** Share of the gap to that resting heat the fire closes each hour. */
export const HEAT_LOSS = 0.28;
/** Heat a single swing pulls out of the fire — the piece leaves it to be struck. */
export const STRIKE_COOL = 0.0016;

/** Swings you can bank in one shift with your own hands, however fast you tap. */
export const HAND_CAP = 60;
/** Swings one level of crew contributes in a shift, at full morale. */
export const CREW_SWINGS = 22;
/** What one die set adds to everything the shop turns out. */
export const DIE_GAIN = 0.05;
/**
 * Share of the rack that goes past truing each shift and is scrapped.
 *
 * This is what stops tooling being a staircase to infinity. A rack is a
 * treadmill: order five sets a shift against a sixth of the rack wearing out
 * and it settles around thirty, which is a real bill against a real revenue
 * rather than a number that only ever climbs.
 */
export const DIE_DECAY = 0.15;
/** Iron, coke and flux behind one swing, in £. */
export const MATERIAL_PER_SWING = 0.012;
/** What a plain finished piece fetches, in £, before the alloy and the market. */
export const PIECE_PRICE = 1.15;

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
/**
 * How far each lever goes. The bellows has twice the travel of the rest
 * because it is the only one whose right answer is hidden: five notches would
 * be a coarser dial than the metal's own working window, and the question
 * "what heat does this want?" would collapse into a guess between two.
 */
export const LEVER_MAX = { bellows: 10, crew: 5, dies: 5, pace: 5 };

/** Cost of one notch of each lever for one shift, in £ at a one-anvil shop. */
export const LEVER_COST = {
  bellows: 0.18,
  crew: 0.95,
  dies: 2.3,
  pace: 0,        // free in money, and ruinous in everything else
};

/**
 * Maintaining a die set you ordered, as a share of what it cost to cut it.
 *
 * Without this, tooling is a one-off purchase of a permanent multiplier: the
 * shop compounds for a flat price and buying dies from shift one dominates
 * every other lever. Upkeep is what gives the tool room an opportunity cost,
 * so tooling becomes a question of *when* rather than a free win.
 */
export const DIE_UPKEEP_SHARE = 0.22;
/** What one die set costs to cut, in £ — the die lever's price per set. */
export const DIE_COST_PER_SET = LEVER_COST.dies;
/** What one die set costs to keep true, every shift thereafter. */
export const DIE_UPKEEP_PER_SET = DIE_COST_PER_SET * DIE_UPKEEP_SHARE;

/** The bill for the tooling already in the rack. Scaled by how fast it wears. */
export function dieUpkeep(dieSets, wear = 1) {
  return Math.round(dieSets * DIE_UPKEEP_PER_SET * wear * 100) / 100;
}

export const LEVERS = [
  { id: 'bellows', label: 'The bellows', icon: '🔥',
    blurb: 'How hard the fire is driven. Every alloy has a heat it wants, and none of them says which.' },
  { id: 'crew', label: 'Apprentices', icon: '🧑‍🏭',
    blurb: 'Hands that are not yours. They swing all shift, and they want paying whether the work is good or not.' },
  { id: 'dies', label: 'Die sets', icon: '🛠️',
    blurb: 'Tooling multiplies everything the shop makes. Cut this shift, in the rack the next — and true them forever after.' },
  { id: 'pace', label: 'The pace', icon: '⏱️',
    blurb: 'Drive the shop harder. Costs nothing in money — it costs morale, and it costs you in scrap.' },
];

export const NO_LEVELS = { bellows: 0, crew: 0, dies: 0, pace: 0 };

/**
 * What a notch of bellows costs here, as a multiple of the going rate.
 *
 * This is where a cold shop, poor coke and a thirsty alloy land. They make
 * heat *dear*, never unreachable: a forge that could not be brought up to
 * crucible heat at any price would simply void every crucible commission in
 * the city, and a target measured on a run nobody can win is not a target.
 */
export function fuelFactor(state) {
  return (chillNow(state) * state.alloy.heatHunger + state.mods.draught) / state.mods.coal;
}

/**
 * The bill for a set of levels, scaled to the size of the shop, plus the
 * upkeep on tooling already cut. A die set is charged once, in the shift you
 * order it, and trued every shift after.
 */
export function shiftSpend(levels, state, dieSets = state.dieSets) {
  return round2(
    (levels.bellows * LEVER_COST.bellows * fuelFactor(state) +
     levels.crew * LEVER_COST.crew * state.mods.wage +
     levels.dies * LEVER_COST.dies) * state.scale
    + dieUpkeep(dieSets, state.mods.wear)
  );
}

/**
 * Trim a set of levels down to what the purse can actually pay for.
 *
 * A shift that was affordable yesterday can quietly stop being affordable
 * today — a bad shift earns nothing and the upkeep is owed anyway. Rather
 * than dead-end the player on a disabled button, the dearest levers are given
 * up first. The pace costs nothing and is never trimmed.
 */
export function affordLevels(levels, state, coin = state.coin, dieSets = state.dieSets) {
  const out = { ...levels };
  for (const key of ['dies', 'crew', 'bellows']) {     // dearest first
    while (out[key] > 0 && shiftSpend(out, state, dieSets) > coin) out[key] -= 1;
  }
  return out;
}

/**
 * Die sets the purse can no longer keep true. Standing upkeep is the one bill
 * `affordLevels` cannot trim — a die is a die — so when upkeep alone outruns
 * the purse, exactly enough sets are sold on to bring it back within reach.
 * Returns the sets to sell (0 when the money covers them all).
 */
export function diesToSell(coin, dieSets, wear = 1) {
  if (dieSets <= 0 || dieUpkeep(dieSets, wear) <= coin) return 0;
  const shortfall = dieUpkeep(dieSets, wear) - Math.max(0, coin);
  return Math.min(dieSets, Math.ceil(shortfall / (DIE_UPKEEP_PER_SET * wear) * 100) / 100);
}

/**
 * Is this set-up one the shop can actually pay for?
 *
 * Against `max(0, coin)` rather than the purse itself, and that is the whole
 * point of it. A shift that ends in the red leaves nothing to trim and nothing
 * to sell — `affordShift` has already emptied the rack — and comparing a bill
 * of nothing against a purse of minus three would refuse to let the shop open
 * its doors at all, for ever. A debt is a debt; it is not a locked gate. You
 * may always work a shift you are spending nothing on, and the retainer is
 * what digs you back out.
 */
export function affordable(levels, state) {
  return shiftSpend(levels, state) <= Math.max(0, state.coin);
}

/**
 * Make this shift affordable, the one way the game allows: sell the tooling
 * the purse cannot keep true, then trim the levers. The same rule binds the
 * player and the reference smiths that set par — a target may only ever be
 * measured against play the UI would actually permit. Mutates `state`;
 * returns the die sets sold, so the briefing can say so.
 */
export function affordShift(state) {
  const sold = diesToSell(state.coin, state.dieSets, state.mods.wear);
  if (sold > 0) state.dieSets = round2(state.dieSets - sold);
  state.levels = affordLevels(state.levels, state);
  return sold;
}

/* ------------------------------------------------------------------ *
 * Modifiers — every knob a workshop, a city or a tier can turn
 * ------------------------------------------------------------------ */

export const NO_MODS = {
  coal: 1,           // how much heat a level of bellows buys
  chill: 1,          // how fast the forge gives its heat back
  skill: 1,          // what an apprentice is worth at the anvil
  wage: 1,           // what an apprentice costs
  iron: 1,           // the price of stock
  demand: 1,         // what a finished piece fetches
  funding: 1,        // the purse and the retainer
  wear: 1,           // how fast tooling goes out of true
  fatigue: 1,        // how fast morale burns under a hard pace
  pride: 1,          // how fast good work brings morale back
  draught: 0,        // heat lost to a shop that will not stay shut
  seasonality: 0,    // a swing in heat loss across the commission
  dieDelay: 0,       // extra shifts before tooling reaches the rack
  shopScale: 1,      // how many anvils there are to keep busy
};

export function withMods(mods) {
  return { ...NO_MODS, ...(mods || {}) };
}

/* ------------------------------------------------------------------ *
 * Alloys
 *
 * `idealHeat` and `window` are the two hidden numbers the whole game turns
 * on, and neither is ever printed. You infer them from the foreman's notes,
 * the way you infer a recipe from a grumble: dull and cracking means cold,
 * sparking and crumbling means burnt.
 * ------------------------------------------------------------------ */

export const ALLOYS = [
  { id: 'mild', name: 'Mild Steel', icon: '🔩',
    blurb: 'Forgiving stuff for gates and brackets. It will take almost any abuse, and it pays almost nothing.',
    idealHeat: [0.55, 0.70], window: [0.20, 0.26], workability: [1.0, 1.15],
    heatHunger: [0.9, 1.05], brittleness: [0.7, 0.9], value: [0.85, 1.0], swings: [8, 9] },
  { id: 'wrought', name: 'Wrought Iron', icon: '⛓️',
    blurb: 'Old, fibrous and worked cool. Drive the fire hard and the slag burns straight out of it.',
    idealHeat: [0.35, 0.48], window: [0.16, 0.22], workability: [1.05, 1.2],
    heatHunger: [1.15, 1.35], brittleness: [0.8, 1.0], value: [0.8, 0.95], swings: [8, 10] },
  { id: 'bronze', name: 'Bronze', icon: '🟠',
    blurb: 'Moves like nothing else — while it is cool. A hair too hot and it is a puddle.',
    idealHeat: [0.25, 0.38], window: [0.10, 0.14], workability: [1.25, 1.45],
    heatHunger: [1.0, 1.2], brittleness: [0.9, 1.1], value: [1.05, 1.25], swings: [6, 8] },
  { id: 'spring', name: 'Spring Steel', icon: '🌀',
    blurb: 'Wants working hot and hates being asked twice. A narrow window and no forgiveness at all.',
    idealHeat: [0.72, 0.86], window: [0.10, 0.14], workability: [0.9, 1.05],
    heatHunger: [0.85, 1.0], brittleness: [1.2, 1.45], value: [1.25, 1.5], swings: [9, 11] },
  { id: 'crucible', name: 'Crucible Steel', icon: '💠',
    blurb: 'The good stuff, and it will only be had at the top of the fire.',
    idealHeat: [0.88, 1.0], window: [0.12, 0.17], workability: [0.85, 1.0],
    heatHunger: [0.8, 0.95], brittleness: [1.1, 1.3], value: [1.45, 1.75], swings: [10, 12] },
  { id: 'nickel', name: 'Nickel Steel', icon: '⚙️',
    blurb: 'Stiff, tough and hot-working. Nothing shifts it but heat and good tooling.',
    idealHeat: [0.95, 1.08], window: [0.15, 0.20], workability: [0.7, 0.85],
    heatHunger: [0.75, 0.9], brittleness: [0.9, 1.1], value: [1.3, 1.55], swings: [11, 13] },
  { id: 'pattern', name: 'Pattern-Weld', icon: '🌊',
    blurb: 'Folded and folded again. Every piece takes half a day of swinging, and every piece sells.',
    idealHeat: [0.75, 0.9], window: [0.18, 0.24], workability: [0.95, 1.1],
    heatHunger: [1.0, 1.15], brittleness: [1.0, 1.2], value: [2.0, 2.4], swings: [13, 15] },
  { id: 'meteoric', name: 'Meteoric Iron', icon: '☄️',
    blurb: 'Fell out of the sky and would rather have stayed there. Unforgiving, and worth a year of gates.',
    idealHeat: [0.6, 0.78], window: [0.09, 0.12], workability: [0.8, 0.95],
    heatHunger: [1.05, 1.25], brittleness: [1.7, 2.0], value: [2.8, 3.4], swings: [11, 14] },
];

export const ALLOY_INDEX = Object.fromEntries(ALLOYS.map((a) => [a.id, a]));

/** Resolve an archetype into the exact bar of metal on this workshop's bench. */
export function rollAlloy(seed, alloyId = null) {
  const rng = mulberry32((seed ^ 0x2545f491) >>> 0);
  const arch = alloyId ? ALLOY_INDEX[alloyId] : ALLOYS[Math.floor(rng() * ALLOYS.length)];
  const span = ([lo, hi]) => lo + rng() * (hi - lo);
  return {
    id: arch.id,
    name: arch.name,
    icon: arch.icon,
    blurb: arch.blurb,
    idealHeat: span(arch.idealHeat),       // hidden
    window: span(arch.window),             // hidden
    workability: span(arch.workability),
    heatHunger: span(arch.heatHunger),
    brittleness: span(arch.brittleness),
    value: span(arch.value),
    swingsPerPiece: span(arch.swings),
  };
}

/* ------------------------------------------------------------------ *
 * Starting a run
 * ------------------------------------------------------------------ */

export function newRun({
  seed, shifts = 12, purse = 11, retainer = 2.4,
  mods = null, alloyId = null, workshop = null, target = null,
} = {}) {
  const m = withMods(mods);
  const scale = m.shopScale;
  return {
    seed, shift: 1, shifts, target, workshop,
    mods: m,
    scale,
    alloy: rollAlloy(seed, alloyId),
    coin: round2(purse * m.funding * scale),
    retainer: round2(retainer * m.funding * scale),
    heat: START_HEAT,          // and back to exactly this every single shift
    morale: START_MORALE,
    dieSets: 0,                // tooling in the rack, and on the maintenance bill
    dieQueue: [],              // [{ shift, sets }] — tooling still being cut
    offcuts: 0,                // swings' worth of free stock lying in the yard
    hands: 0,                  // swings banked by tapping, this shift only
    pieces: 0,
    scrapped: 0,
    swungTotal: 0,
    goodTotal: 0,
    levels: { ...NO_LEVELS },
    history: [],
    phase: 'briefing',
  };
}

/** Swings the shop's own hands are worth this shift, before the pace. */
export function crewSwings(state, level) {
  return CREW_SWINGS * level * (0.4 + 0.6 * state.morale) * state.mods.skill * state.scale;
}

/** How much harder the shop is being driven. */
export function paceFactor(level) {
  return 1 + 0.12 * level;
}

/** Swings the whole shop lands this shift, hands and crew together. */
export function shiftSwings(state, levels = state.levels, hands = state.hands) {
  return (clamp(hands, 0, handCap(state)) + crewSwings(state, levels.crew)) * paceFactor(levels.pace);
}

/** How many swings of your own you may bank in a shift. A shop, not a machine. */
export function handCap(state) {
  return Math.round(HAND_CAP * state.scale);
}

/** What the tooling in the rack multiplies the shop's output by. */
export function dieFactor(state) {
  return 1 + DIE_GAIN * state.dieSets;
}

/** Share of the work that comes off the anvil ruined, before the heat is judged. */
export function scrapRate(state, level) {
  return clamp(
    0.03 + 0.035 * level * state.alloy.brittleness * (1.2 - 0.5 * state.morale),
    0, 0.6,
  );
}

/**
 * How well the metal is taking the hammer at this heat: one at the alloy's own
 * working heat, falling away either side of it. Neither number is ever shown.
 */
export function workQuality(alloy, heat) {
  const off = (heat - alloy.idealHeat) / alloy.window;
  return Math.exp(-off * off);
}

/**
 * Where the fire settles at this bellows notch, if nothing is being struck.
 *
 * Deliberately the same everywhere: the notch buys the heat, and the shop, the
 * weather and the alloy's thirst decide what that notch *costs* (see
 * `fuelFactor`). The fire never starts there — it climbs from what is left of
 * last night's, and everything the shop strikes drags it back down.
 */
export function restingHeat(level) {
  return HEAT_PER_NOTCH * level;
}

/**
 * The fire through the eight hours of a shift, given how hard it is being
 * driven and how much is being pulled out of it to be struck. The shape of
 * this curve is the game: it starts cold, climbs, and settles wherever the
 * bellows and the hammers agree.
 */
export function heatCurve(state, bellows, perTick, coke = 1) {
  const target = restingHeat(bellows) * coke;
  const drag = STRIKE_COOL * perTick / state.scale;
  const out = [];
  let heat = START_HEAT;           // the fire died overnight, as it does every night
  for (let hour = 0; hour < TICKS_PER_SHIFT; hour++) {
    heat = clamp(heat + HEAT_LOSS * (target - heat) - drag, 0, MAX_HEAT);
    out.push(heat);
  }
  return out;
}

/**
 * The notch that would work this metal best, given how many hammers are
 * pulling heat out of the fire. The reference smith knows the metal; the
 * player has to read it off the foreman's notes, which is the whole game.
 */
export function bestBellows(state, perTick) {
  let best = 0, bestScore = -1;
  for (let n = 0; n <= LEVER_MAX.bellows; n++) {
    const score = heatCurve(state, n, perTick)
      .reduce((sum, heat) => sum + workQuality(state.alloy, heat), 0);
    if (score > bestScore) { bestScore = score; best = n; }
  }
  return best;
}

/** How cold the shop is running today — a season's swing over the commission. */
export function chillNow(state) {
  const season = state.mods.seasonality
    ? 1 + state.mods.seasonality * Math.sin((state.shift / state.shifts) * Math.PI * 2)
    : 1;
  return state.mods.chill * season;
}

/** What a finished piece fetches here. */
export function piecePrice(state) {
  return PIECE_PRICE * state.alloy.value * state.mods.demand;
}

/* ------------------------------------------------------------------ *
 * The shift
 * ------------------------------------------------------------------ */

/**
 * Work the shift, an hour at a time. Pure: reads the state and the levels and
 * hand swings already set on it and returns a report, including the fire it
 * ends on. `commitShift` is what writes any of it back.
 */
export function simulateShift(state) {
  const m = state.mods;
  const a = state.alloy;
  const L = state.levels;
  const rng = mulberry32(state.seed + state.shift * 104729 + 17);

  // Tooling cut in an earlier shift that reaches the rack this morning.
  const arrived = state.dieQueue.filter((q) => q.shift <= state.shift).reduce((n, q) => n + q.sets, 0);
  const dieSets = state.dieSets + arrived;
  const tooling = 1 + DIE_GAIN * dieSets;

  const swings = shiftSwings(state, L, state.hands);
  const perTick = swings / TICKS_PER_SHIFT;
  const scrap = scrapRate(state, L.pace);
  // No day is quite the same twice: the coke, the weather, the boy on the bellows.
  const coke = 0.95 + rng() * 0.1;
  const curve = heatCurve(state, L.bellows, perTick, coke);

  let good = 0, ruined = 0, heatSum = 0, hottest = 0, coldest = MAX_HEAT;
  for (const heat of curve) {
    heatSum += heat;
    if (heat > hottest) hottest = heat;
    if (heat < coldest) coldest = heat;

    const q = workQuality(a, heat);
    good += perTick * q * (1 - scrap);
    ruined += perTick * (1 - q * (1 - scrap));
  }

  const pieces = (good * a.workability * tooling) / a.swingsPerPiece;
  // Offcuts in the yard are worked before anything is bought in.
  const bought = Math.max(0, swings - (state.offcuts || 0));
  const materials = round2(bought * MATERIAL_PER_SWING * m.iron);
  const spend = shiftSpend(L, state);
  const revenue = round2(pieces * piecePrice(state));
  const retainer = round2(state.retainer);

  // Morale: a hard pace burns it, an easy shift gives some back, and work that
  // comes off the anvil clean lifts the whole shop — always a shift behind.
  const cleanShare = swings > 0 ? good / swings : 0;
  const drain = 0.03 * L.pace * m.fatigue;
  const rest = L.pace <= 1 ? 0.02 : 0;
  const proud = 0.05 * cleanShare * m.pride;
  const moraleDelta = clamp(-drain + rest + proud, -0.3, 0.12);

  return {
    shift: state.shift,
    levels: { ...L },
    hands: clamp(state.hands, 0, handCap(state)),
    swings, perTick, scrap, tooling, dieSets, arrived,
    offcutsUsed: Math.min(state.offcuts || 0, swings),
    avgHeat: heatSum / TICKS_PER_SHIFT, hottest, coldest,
    resting: restingHeat(L.bellows),
    good, ruined, cleanShare,
    pieces, materials, spend, revenue, retainer,
    net: round2(revenue + retainer - spend - materials),
    moraleDelta,
    maturesAt: state.shift + 1 + m.dieDelay,
    // Rounded figures the report reads off.
    piecesShown: Math.round(pieces),
    ruinedShown: Math.round(ruined),
  };
}

/** Apply a worked shift to the state and move the calendar forward. */
export function commitShift(state, result) {
  // A shift's work takes a share of the rack past truing. Ordering has to keep
  // up with wear, which is what keeps tooling an engine rather than a staircase.
  result.worn = round2(state.dieSets * DIE_DECAY * state.mods.wear);
  state.dieSets = round2(Math.max(0, state.dieSets - result.worn) + result.arrived);
  state.dieQueue = state.dieQueue.filter((q) => q.shift > state.shift);
  if (state.levels.dies > 0) state.dieQueue.push({ shift: result.maturesAt, sets: state.levels.dies });

  state.offcuts = Math.max(0, (state.offcuts || 0) - result.swings);
  state.pieces += result.pieces;
  state.scrapped += result.ruined;
  state.swungTotal += result.swings;
  state.goodTotal += result.good;
  state.coin = round2(state.coin + result.net);

  // Tooling you cannot keep true is tooling that gets sold on. `affordShift`
  // should have balanced the books before the shift ran; this is the safety
  // net for a shift that still ended in the red. A sale refunds exactly the
  // upkeep it saves and not a penny more — a shortfall that outlives every die
  // set stays owed, for the reference smiths exactly as for the player.
  result.diesSold = 0;
  if (state.coin < 0 && state.dieSets > 0) {
    const rate = DIE_UPKEEP_PER_SET * state.mods.wear;
    const sold = Math.min(state.dieSets, -state.coin / rate);
    state.dieSets = round2(state.dieSets - sold);
    state.coin = round2(state.coin + sold * rate);
    result.diesSold = sold;
  }

  state.morale = clamp(state.morale + result.moraleDelta, 0.1, 1);
  state.heat = START_HEAT;      // and it is cold again in the morning
  state.hands = 0;

  result.notes = foremanNotes(state, result);
  state.history.push(result);
  state.shift += 1;
  state.phase = state.shift > state.shifts ? 'gameover' : 'briefing';
  return state;
}

/**
 * What the shift taught you. Deliberately qualitative — the alloy's working
 * heat is never printed, so you read it off the metal instead.
 */
export function foremanNotes(state, result) {
  const a = state.alloy;
  const L = result.levels;
  const notes = [];
  const off = result.avgHeat - a.idealHeat;

  if (result.swings <= 0) {
    notes.push('Nobody swung a hammer today. Nothing was made and the bills came all the same.');
  } else if (off < -a.window * 1.3) {
    notes.push('The bar came off the fire dull and stiff. It fought the hammer, and most of it cracked.');
  } else if (off > a.window * 1.3) {
    notes.push('Sparks everywhere. That was not metal moving — that was metal burning.');
  } else if (Math.abs(off) < a.window * 0.5) {
    notes.push('It moved like butter under the hammer. Whatever you did to that fire, do it again.');
  } else if (off < 0) {
    notes.push('Close, but it stiffened towards the end of every heat. It would take a little more fire.');
  } else {
    notes.push('Close, but it was scaling in the fire. A touch less draught on the bellows.');
  }

  if (L.pace >= 4 && result.scrap > 0.2) {
    notes.push(`Driven that hard, ${Math.round(result.scrap * 100)}% of the work is coming off ruined before the heat is even judged.`);
  }
  if (state.morale < 0.35) {
    notes.push('The lads are done in. Half the anvils are quiet by mid-afternoon.');
  } else if (result.moraleDelta < -0.08) {
    notes.push('The shop is tiring.');
  } else if (result.moraleDelta > 0.05 && L.crew > 0) {
    notes.push('Clean work all round. The shop is walking taller for it.');
  }

  if (result.arrived > 0) {
    notes.push(`${Math.round(result.arrived)} new die set${result.arrived === 1 ? '' : 's'} in the rack — everything the shop makes is up ${Math.round((result.tooling - 1) * 100)}%.`);
  } else if (L.dies > 0) {
    const next = Math.min(...state.dieQueue.map((q) => q.shift));
    notes.push(`The tool room is still cutting. Nothing in the rack before shift ${next}.`);
  }
  if (result.worn >= 1) {
    notes.push(`${Math.round(result.worn)} die set${result.worn >= 2 ? 's' : ''} went past truing and were scrapped. The rack does not stand still.`);
  }
  if (result.diesSold > 0.5) {
    notes.push(`${Math.round(result.diesSold)} die set${result.diesSold >= 2 ? 's' : ''} sold on — there was no money left to keep them true.`);
  }
  if (state.mods.draught >= 0.06) {
    notes.push('The doors will not stay shut. The fire is fighting the yard all day.');
  }
  if (result.net < 0) {
    notes.push(`The shift lost £${Math.abs(result.net).toFixed(1)}. The purse will not take many of those.`);
  }
  if (notes.length === 1 && result.pieces > 0) {
    notes.push(`${Math.round(result.pieces)} pieces to the crate, ${Math.round(result.ruined)} to the scrap bin.`);
  }
  return notes.slice(0, 4);
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

export function finalScore(state) {
  const clean = state.swungTotal > 0 ? state.goodTotal / state.swungTotal : 0;
  return {
    pieces: Math.round(state.pieces),
    scrapped: Math.round(state.scrapped),
    clean,
    coinLeft: round2(state.coin),
    dieSets: Math.round(state.dieSets),
    morale: state.morale,
    target: state.target,
    won: state.target == null ? null : Math.round(state.pieces) >= state.target,
    rank: rankFor(clean),
  };
}

function rankFor(clean) {
  if (clean >= 0.82) return { title: 'Masterwork', icon: '🏆' };
  if (clean >= 0.68) return { title: 'Guild Standard', icon: '🥇' };
  if (clean >= 0.52) return { title: 'Serviceable', icon: '🔨' };
  if (clean >= 0.34) return { title: 'Rough', icon: '🪓' };
  if (clean >= 0.15) return { title: 'Mostly Scrap', icon: '🗑️' };
  return { title: 'Ruined', icon: '💀' };
}

/* ------------------------------------------------------------------ *
 * Reference play
 *
 * A smith used to set each workshop's target ("par"). It works a small family
 * of doctrines against the workshop's own alloy, shop and purse and keeps the
 * best. Because the search happens on the workshop itself, the target is
 * calibrated automatically — meteoric iron in a cold, broke shop gets an
 * honestly lower bar than mild steel in a rich one, without anyone balancing
 * 625 numbers by hand.
 * ------------------------------------------------------------------ */

/**
 * The doctrines the reference smith searches over.
 *
 * The family has to contain the best play available, or par understates what
 * the workshop can give and the targets come out too soft. It must therefore
 * span the bellows across the whole range of working heats — a doctrine that
 * never reaches crucible heat cannot judge a crucible shop — and both sides of
 * the tooling question, since cutting dies on shift one and cutting them once
 * the shop can afford them are genuinely different trades.
 *
 * Combinations that would only duplicate another are dropped: a doctrine that
 * never cuts a die has no timing to choose.
 */
export const DOCTRINES = (() => {
  const out = [];
  for (const crew of [0, 3, MAX_LEVEL]) {
    for (const dies of [0, 3, MAX_LEVEL]) {
      for (const diesEarly of dies === 0 ? [false] : [true, false]) {
        for (const pace of [0, 2, 4]) {
          for (const hands of [1, 0]) {
            for (const fireFirst of [true, false]) {
              out.push({ crew, dies, diesEarly, pace, hands, fireFirst });
            }
          }
        }
      }
    }
  }
  return out;
})();

/**
 * What the reference smith would set this shift under `doctrine`.
 *
 * The bellows is not part of the doctrine, because it is not a matter of
 * doctrine: there is a notch this metal wants and the smith knows it. That is
 * exactly the knowledge the player does not have, and the whole reason a
 * target is only ever a share of par.
 */
export function referenceLevels(state, doctrine, hands) {
  const trial = { ...NO_LEVELS, crew: doctrine.crew, pace: doctrine.pace };
  const want = {
    bellows: bestBellows(state, shiftSwings(state, trial, hands) / TICKS_PER_SHIFT),
    crew: doctrine.crew,
    // Cut tooling early, or once the shop is earning enough to be worth
    // multiplying. Either way, never so late it would not arrive.
    dies: (doctrine.diesEarly || state.pieces > 0) && state.shift + 1 + state.mods.dieDelay <= state.shifts
      ? doctrine.dies : 0,
    pace: doctrine.pace,
  };

  // Trim to what the purse covers, in priority order. Whether the fire or the
  // hands come first is a real trade — a cold shop full of apprentices makes
  // scrap all day — so the family plays both.
  const order = doctrine.fireFirst ? ['bellows', 'crew', 'dies'] : ['crew', 'dies', 'bellows'];
  const levels = { ...NO_LEVELS, pace: want.pace };
  for (const key of order) {
    for (let n = want[key]; n > 0; n--) {
      const t = { ...levels, [key]: n };
      if (shiftSpend(t, state) <= state.coin) { levels[key] = n; break; }
    }
  }
  return levels;
}

/** Work a whole commission under one doctrine and report the pieces delivered. */
export function playDoctrine(config, doctrine) {
  const state = newRun(config);
  while (state.phase !== 'gameover') {
    affordShift(state);                    // the smiths sell tooling exactly as the player must
    const hands = doctrine.hands * handCap(state);
    state.levels = referenceLevels(state, doctrine, hands);
    state.hands = hands;
    commitShift(state, simulateShift(state));
  }
  return state.pieces;
}

/**
 * Pieces the best doctrine in the family delivers at this workshop.
 * This is what workshop targets are measured against.
 */
export function parPieces(config) {
  let best = 0;
  for (const doctrine of DOCTRINES) {
    const pieces = playDoctrine(config, doctrine);
    if (pieces > best) best = pieces;
  }
  return best;
}
