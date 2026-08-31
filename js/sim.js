/**
 * Lemonade Stand — game rules and day simulation.
 *
 * Everything here is pure: give it a state object and it gives you numbers
 * back. No DOM, no storage. The UI layer (app.js) owns all of that, and the
 * tests in tests/sim.test.mjs drive this file directly under node.
 */

export const CUPS_PER_PITCHER = 10;
export const TOTAL_DAYS = 30;
export const STARTING_MONEY = 20.0;

// Ideal recipe for one pitcher. Straying from it costs you satisfaction.
const IDEAL_LEMONS = 5;
const IDEAL_SUGAR = 5;

/** Deterministic PRNG so a day can be replayed (and unit tested). */
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

export const WEATHER = {
  scorcher:  { id: 'scorcher',  label: 'Scorcher',      icon: '🔥', traffic: 1.35, tempRange: [92, 104] },
  sunny:     { id: 'sunny',     label: 'Sunny',         icon: '☀️', traffic: 1.15, tempRange: [76, 92] },
  fair:      { id: 'fair',      label: 'Fair',          icon: '🌤️', traffic: 1.0,  tempRange: [68, 82] },
  cloudy:    { id: 'cloudy',    label: 'Cloudy',        icon: '☁️', traffic: 0.82, tempRange: [60, 74] },
  drizzle:   { id: 'drizzle',   label: 'Drizzle',       icon: '🌦️', traffic: 0.5,  tempRange: [55, 70] },
  storm:     { id: 'storm',     label: 'Thunderstorms', icon: '⛈️', traffic: 0.22, tempRange: [52, 68] },
};

// Rough seasonal drift: the month warms up as the 30 days pass.
function pickWeather(rng, day) {
  const warmth = day / TOTAL_DAYS; // 0 → 1
  const weights = [
    [WEATHER.scorcher, 0.04 + 0.22 * warmth],
    [WEATHER.sunny,    0.24 + 0.12 * warmth],
    [WEATHER.fair,     0.28],
    [WEATHER.cloudy,   0.22 - 0.08 * warmth],
    [WEATHER.drizzle,  0.14 - 0.06 * warmth],
    [WEATHER.storm,    0.08 - 0.04 * warmth],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [w, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return w;
  }
  return WEATHER.fair;
}

function pickTemp(rng, weather) {
  const [lo, hi] = weather.tempRange;
  return Math.round(lo + rng() * (hi - lo));
}

export const EVENTS = [
  { id: 'fair',      text: 'A street fair is setting up down the block!', traffic: 1.7,  chance: 0.06 },
  { id: 'parade',    text: 'The summer parade marches right past you.',   traffic: 1.55, chance: 0.05 },
  { id: 'heatwave',  text: 'Heat advisory — everyone is desperate for something cold.', traffic: 1.4, chance: 0.06 },
  { id: 'roadwork',  text: 'Road crews closed the street. Hardly anyone walks by.', traffic: 0.45, chance: 0.06 },
  { id: 'rival',     text: 'A kid opened a rival stand on the next corner.', traffic: 0.65, chance: 0.07 },
  { id: 'icetruck',  text: 'The ice truck broke down — ice cost double today.', traffic: 1.0, chance: 0.05, icePrice: 2.0 },
  { id: 'lemonglut', text: 'A lemon truck spilled its load. Lemons are cheap!', traffic: 1.0, chance: 0.05, lemonPrice: 0.55 },
  { id: 'schooltrip',text: 'A school bus unloaded a field trip nearby.',    traffic: 1.35, chance: 0.05 },
];

function pickEvent(rng) {
  for (const ev of EVENTS) {
    if (rng() < ev.chance) return ev;
  }
  return null;
}

/** Supply prices wobble a little day to day, then events adjust them. */
function rollPrices(rng, event) {
  const jitter = (base, spread) => round2(base * (1 - spread + rng() * spread * 2));
  const prices = {
    lemon: jitter(0.38, 0.25),   // each
    sugar: jitter(0.3, 0.2),     // one cup of sugar
    ice: jitter(0.05, 0.3),      // one cube
    cup: jitter(0.09, 0.15),     // one paper cup
  };
  if (event?.lemonPrice) prices.lemon = round2(prices.lemon * event.lemonPrice);
  if (event?.icePrice) prices.ice = round2(prices.ice * event.icePrice);
  return prices;
}

/** How much ice a customer expects per cup at this temperature. */
export function idealIcePerCup(temp) {
  return clamp(Math.round((temp - 52) / 12), 0, 5);
}

/** Bell curve around a target: 1.0 when perfect, tailing off as you drift. */
function scoreAgainst(value, ideal, tolerance) {
  const dev = (value - ideal) / tolerance;
  return Math.exp(-dev * dev);
}

/**
 * How good the lemonade tastes, 0..1, given the recipe and the weather.
 * Weak or sour drinks and warm cups on a hot day all land here.
 */
export function recipeQuality(recipe, temp) {
  const lemonScore = scoreAgainst(recipe.lemons, IDEAL_LEMONS, 2.6);
  const sugarScore = scoreAgainst(recipe.sugar, IDEAL_SUGAR, 2.6);
  const iceScore = scoreAgainst(recipe.ice, idealIcePerCup(temp), 1.9);
  return clamp(0.4 * lemonScore + 0.32 * sugarScore + 0.28 * iceScore, 0, 1);
}

/** Cost of the ingredients in a single cup, at today's prices. */
export function costPerCup(recipe, prices) {
  const perPitcher = recipe.lemons * prices.lemon + recipe.sugar * prices.sugar;
  return round2(perPitcher / CUPS_PER_PITCHER + recipe.ice * prices.ice + prices.cup);
}

/** Most cups you can pour with what's in the cooler right now. */
export function maxCupsAvailable(inventory, recipe) {
  const byLemons = Math.floor(inventory.lemons / Math.max(1, recipe.lemons));
  const bySugar = Math.floor(inventory.sugar / Math.max(1, recipe.sugar));
  const pitchers = Math.min(byLemons, bySugar);
  const byIce = recipe.ice > 0 ? Math.floor(inventory.ice / recipe.ice) : Infinity;
  return Math.max(0, Math.min(pitchers * CUPS_PER_PITCHER, byIce, inventory.cups));
}

/**
 * What the crowd grumbled about today. Deliberately qualitative — the player
 * dials in the recipe from these hints rather than reading a target number.
 */
export function customerNotes(recipe, temp, result) {
  const gripes = [];
  const iceIdeal = idealIcePerCup(temp);
  const push = (weight, text) => gripes.push({ weight, text });

  if (recipe.lemons <= IDEAL_LEMONS - 2) push(IDEAL_LEMONS - recipe.lemons, 'Tastes like lemon-flavoured water.');
  if (recipe.lemons >= IDEAL_LEMONS + 2) push(recipe.lemons - IDEAL_LEMONS, 'Way too sour — my mouth is puckering.');
  if (recipe.sugar <= IDEAL_SUGAR - 2) push(IDEAL_SUGAR - recipe.sugar, 'Not sweet enough for me.');
  if (recipe.sugar >= IDEAL_SUGAR + 2) push(recipe.sugar - IDEAL_SUGAR, 'Syrupy. My teeth hurt.');
  if (recipe.ice <= iceIdeal - 1) push((iceIdeal - recipe.ice) * 1.5, temp >= 85 ? 'This is warm on a day like today!' : 'Could use a bit more ice.');
  if (recipe.ice >= iceIdeal + 2) push(recipe.ice - iceIdeal, 'Mostly ice cubes. Where is the lemonade?');

  gripes.sort((a, b) => b.weight - a.weight);
  const notes = gripes.slice(0, 2).map((g) => g.text);

  if (result) {
    if (result.stock === 0) {
      return ['You had nothing to pour, so the stand stayed shut.'];
    }
    if (result.potential > 0 && result.interested / result.potential < 0.35 && result.price > 0.75) {
      notes.push('Plenty of people looked, then balked at the price.');
    }
    if (result.lostToStockout > 0) {
      notes.push(`You sold out — ${result.lostToStockout} customer${result.lostToStockout === 1 ? '' : 's'} left empty-handed.`);
    }
  }
  if (notes.length === 0) notes.push('Best lemonade on the block!');
  return notes;
}

export function newGame(seed = Math.floor(Math.random() * 1e9)) {
  const state = {
    seed,
    day: 1,
    money: STARTING_MONEY,
    reputation: 0.5,
    inventory: { lemons: 0, sugar: 0, ice: 0, cups: 0 },
    recipe: { lemons: 5, sugar: 5, ice: 2 },
    price: 0.5,
    history: [],
    today: null,
    phase: 'forecast',
  };
  state.today = rollDay(state);
  return state;
}

/** Weather, headlines and supply prices for the day about to start. */
export function rollDay(state) {
  const rng = mulberry32(state.seed + state.day * 7919);
  const weather = pickWeather(rng, state.day);
  const temp = pickTemp(rng, weather);
  const event = pickEvent(rng);
  return {
    weather: weather.id,
    temp,
    event: event ? { id: event.id, text: event.text } : null,
    prices: rollPrices(rng, event),
    trafficMod: (event?.traffic ?? 1) * weather.traffic,
  };
}

export function buyCost(prices, order) {
  return round2(
    order.lemons * prices.lemon +
    order.sugar * prices.sugar +
    order.ice * prices.ice +
    order.cups * prices.cup
  );
}

/**
 * Run the day. Walks every potential customer past the stand and asks
 * whether they'd pay your price for what you're pouring.
 */
export function simulateDay(state) {
  const today = state.today;
  const rng = mulberry32(state.seed + state.day * 104729 + 17);
  const quality = recipeQuality(state.recipe, today.temp);

  // Thirst climbs steeply once it gets hot.
  const heat = clamp((today.temp - 48) / 46, 0, 1);
  const thirst = 0.35 + 1.25 * heat * heat;
  const repFactor = 0.45 + 1.1 * state.reputation;
  const potential = Math.max(
    0,
    Math.round(22 * thirst * today.trafficMod * repFactor * (0.88 + rng() * 0.24))
  );

  const stock = maxCupsAvailable(state.inventory, state.recipe);

  // What a passer-by would pay: better lemonade and hotter days raise it.
  const baseWillingness = 0.1 + 1.35 * quality + 0.7 * heat;

  let interested = 0;
  for (let i = 0; i < potential; i++) {
    // Spread of budgets across the crowd — some splurge, some are stingy.
    const personal = baseWillingness * (0.6 + rng() * 0.8);
    if (state.price <= personal) interested++;
  }

  const sold = Math.min(interested, stock);
  const lostToStockout = Math.max(0, interested - stock);
  const pitchersMade = Math.ceil(sold / CUPS_PER_PITCHER);

  const used = {
    lemons: pitchersMade * state.recipe.lemons,
    sugar: pitchersMade * state.recipe.sugar,
    ice: sold * state.recipe.ice,
    cups: sold,
  };
  const revenue = round2(sold * state.price);
  const cogs = round2(
    pitchersMade * (state.recipe.lemons * today.prices.lemon + state.recipe.sugar * today.prices.sugar) +
    used.ice * today.prices.ice +
    used.cups * today.prices.cup
  );

  // Reputation follows the drink first, then how you priced it. Word only
  // spreads through cups actually sold, and the last stretch to a perfect
  // reputation is the hardest to earn.
  const valueForMoney = clamp(baseWillingness - state.price, -1, 1);
  let repDelta;
  if (sold === 0) {
    repDelta = stock === 0 ? -0.01 : -0.02; // shut, or nobody bit at that price
  } else {
    repDelta = clamp(
      0.09 * (quality - 0.55) * 2 + 0.03 * valueForMoney - (lostToStockout > potential * 0.25 ? 0.03 : 0),
      -0.09,
      0.09
    );
    if (repDelta > 0) repDelta *= 1.6 * (1 - state.reputation);
  }

  const result = {
    day: state.day,
    weather: today.weather,
    temp: today.temp,
    event: today.event,
    potential,
    interested,
    sold,
    lostToStockout,
    stock,
    quality,
    price: state.price,
    revenue,
    cogs,
    profit: round2(revenue - cogs),
    used,
    repDelta,
  };
  result.notes = customerNotes(state.recipe, today.temp, result);
  return result;
}

/** Apply a simulated day to the state and move the calendar forward. */
export function commitDay(state, result) {
  state.money = round2(state.money + result.revenue);
  state.inventory.lemons -= result.used.lemons;
  state.inventory.sugar -= result.used.sugar;
  state.inventory.cups -= result.used.cups;
  result.melted = Math.max(0, state.inventory.ice - result.used.ice);
  state.inventory.ice = 0; // whatever is left melts overnight
  state.reputation = clamp(state.reputation + result.repDelta, 0.05, 1);
  state.history.push(result);
  state.day += 1;
  if (state.day > TOTAL_DAYS) {
    state.phase = 'gameover';
  } else if (isBankrupt(state)) {
    state.bankrupt = true;
    state.phase = 'gameover';
  } else {
    state.today = rollDay(state);
    state.phase = 'forecast';
  }
  return state;
}

/**
 * Nothing left to pour and not enough cash for the cheapest possible pitcher
 * (one lemon, one spoon of sugar, one paper cup) at today's prices.
 */
export function isBankrupt(state) {
  if (maxCupsAvailable(state.inventory, state.recipe) > 0) return false;
  const p = state.today.prices;
  const cheapestCup = p.lemon + p.sugar + p.cup;
  return state.money < cheapestCup;
}

export function finalScore(state) {
  const totals = state.history.reduce(
    (acc, d) => {
      acc.revenue += d.revenue;
      acc.profit += d.profit;
      acc.sold += d.sold;
      return acc;
    },
    { revenue: 0, profit: 0, sold: 0 }
  );
  const best = state.history.reduce((a, b) => (b.profit > (a?.profit ?? -Infinity) ? b : a), null);
  return {
    money: round2(state.money),
    net: round2(state.money - STARTING_MONEY),
    revenue: round2(totals.revenue),
    profit: round2(totals.profit),
    cupsSold: totals.sold,
    bestDay: best,
    reputation: state.reputation,
    rank: state.bankrupt ? { title: 'Out of Business', icon: '💸' } : rankFor(state.money),
    bankrupt: !!state.bankrupt,
  };
}

function rankFor(money) {
  if (money >= 350) return { title: 'Lemonade Tycoon', icon: '👑' };
  if (money >= 220) return { title: 'Franchise Owner', icon: '🏆' };
  if (money >= 120) return { title: 'Corner Champion', icon: '🥇' };
  if (money >= 60) return { title: 'Steady Squeezer', icon: '🍋' };
  if (money >= STARTING_MONEY) return { title: 'Broke Even', icon: '🙂' };
  return { title: 'Sour Season', icon: '😬' };
}
