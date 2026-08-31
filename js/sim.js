/**
 * Lemonade Stand — day simulation.
 *
 * A "run" is one stretch of days on one street corner: some working capital,
 * a profit target, and a set of modifiers that make the corner what it is.
 * Free play is just a run with no target and no modifiers.
 *
 * Everything here is pure: give it a state object and it gives numbers back.
 * No DOM, no storage. campaign.js decides which runs exist; app.js draws them.
 */

export const CUPS_PER_PITCHER = 10;
export const TOTAL_DAYS = 30;      // free play season length
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

/** Every knob a corner, city or difficulty can turn. */
export const NO_MODS = {
  traffic: 1,        // how many people walk past
  willingness: 1,    // how much they'll pay
  tempShift: 0,      // °F added to every forecast
  hotBias: 1,        // weight on hot weather
  wetBias: 1,        // weight on rain and storms
  eventChance: 1,    // how often the street throws a surprise
  strictness: 1,     // >1 means fussier palates
  iceExtra: 0,       // extra ice per cup expected (it melts fast here)
  rent: 0,           // charged every day, sold out or not
  repSwing: 1,       // how fast word gets around
  lemonPrice: 1,
  sugarPrice: 1,
  icePrice: 1,
  cupPrice: 1,
};

export function withMods(mods) {
  return { ...NO_MODS, ...(mods || {}) };
}

export const WEATHER = {
  scorcher:  { id: 'scorcher',  label: 'Scorcher',      icon: '🔥', traffic: 1.35, tempRange: [92, 104], hot: true },
  sunny:     { id: 'sunny',     label: 'Sunny',         icon: '☀️', traffic: 1.15, tempRange: [76, 92], hot: true },
  fair:      { id: 'fair',      label: 'Fair',          icon: '🌤️', traffic: 1.0,  tempRange: [68, 82] },
  cloudy:    { id: 'cloudy',    label: 'Cloudy',        icon: '☁️', traffic: 0.82, tempRange: [60, 74] },
  drizzle:   { id: 'drizzle',   label: 'Drizzle',       icon: '🌦️', traffic: 0.5,  tempRange: [55, 70], wet: true },
  storm:     { id: 'storm',     label: 'Thunderstorms', icon: '⛈️', traffic: 0.22, tempRange: [52, 68], wet: true },
};

// Rough seasonal drift: the run warms up as its days pass.
function pickWeather(rng, day, days, mods) {
  const warmth = day / Math.max(1, days); // 0 → 1
  const weights = [
    [WEATHER.scorcher, (0.04 + 0.22 * warmth) * mods.hotBias],
    [WEATHER.sunny,    (0.24 + 0.12 * warmth) * mods.hotBias],
    [WEATHER.fair,     0.28],
    [WEATHER.cloudy,   0.22 - 0.08 * warmth],
    [WEATHER.drizzle,  (0.14 - 0.06 * warmth) * mods.wetBias],
    [WEATHER.storm,    (0.08 - 0.04 * warmth) * mods.wetBias],
  ].filter(([, w]) => w > 0);
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [w, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return w;
  }
  return WEATHER.fair;
}

function pickTemp(rng, weather, mods) {
  const [lo, hi] = weather.tempRange;
  return Math.round(lo + rng() * (hi - lo) + mods.tempShift);
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

function pickEvent(rng, mods) {
  for (const ev of EVENTS) {
    if (rng() < ev.chance * mods.eventChance) return ev;
  }
  return null;
}

/** Supply prices wobble a little day to day, then events adjust them. */
function rollPrices(rng, event, mods) {
  const jitter = (base, spread) => round2(base * (1 - spread + rng() * spread * 2));
  const prices = {
    lemon: jitter(0.38 * mods.lemonPrice, 0.25),  // each
    sugar: jitter(0.3 * mods.sugarPrice, 0.2),    // one cup of sugar
    ice: jitter(0.05 * mods.icePrice, 0.3),       // one cube
    cup: jitter(0.09 * mods.cupPrice, 0.15),      // one paper cup
  };
  if (event?.lemonPrice) prices.lemon = round2(prices.lemon * event.lemonPrice);
  if (event?.icePrice) prices.ice = round2(prices.ice * event.icePrice);
  return prices;
}

/** How much ice a customer expects per cup at this temperature. */
export function idealIcePerCup(temp, mods = NO_MODS) {
  return clamp(Math.round((temp - 52) / 12) + (mods.iceExtra || 0), 0, 7);
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
export function recipeQuality(recipe, temp, mods = NO_MODS) {
  const t = (base) => base / mods.strictness;
  const lemonScore = scoreAgainst(recipe.lemons, IDEAL_LEMONS, t(2.6));
  const sugarScore = scoreAgainst(recipe.sugar, IDEAL_SUGAR, t(2.6));
  const iceScore = scoreAgainst(recipe.ice, idealIcePerCup(temp, mods), t(1.9));
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
export function customerNotes(recipe, temp, result, mods = NO_MODS) {
  const gripes = [];
  const iceIdeal = idealIcePerCup(temp, mods);
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

/**
 * Start a run. `days` and `stake` set the shape of it; `target` is the profit
 * you have to clear to claim the corner (null for free play).
 */
export function newRun({
  seed = Math.floor(Math.random() * 1e9),
  days = TOTAL_DAYS,
  stake = STARTING_MONEY,
  target = null,
  mods = null,
  corner = null,
} = {}) {
  const state = {
    seed,
    day: 1,
    days,
    stake,
    target,
    corner,               // { cityId, index, name } when played from the campaign
    mods: withMods(mods),
    money: stake,
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

/** Free play: the original thirty-day season with nothing stacked against you. */
export function newGame(seed = Math.floor(Math.random() * 1e9)) {
  return newRun({ seed });
}

/** Weather, headlines and supply prices for the day about to start. */
export function rollDay(state) {
  const mods = withMods(state.mods);
  const rng = mulberry32(state.seed + state.day * 7919);
  const weather = pickWeather(rng, state.day, state.days ?? TOTAL_DAYS, mods);
  const temp = pickTemp(rng, weather, mods);
  const event = pickEvent(rng, mods);
  return {
    weather: weather.id,
    temp,
    event: event ? { id: event.id, text: event.text } : null,
    prices: rollPrices(rng, event, mods),
    trafficMod: (event?.traffic ?? 1) * weather.traffic * mods.traffic,
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
  const mods = withMods(state.mods);
  const rng = mulberry32(state.seed + state.day * 104729 + 17);
  const quality = recipeQuality(state.recipe, today.temp, mods);

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
  const baseWillingness = (0.1 + 1.35 * quality + 0.7 * heat) * mods.willingness;

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
  repDelta *= mods.repSwing;

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
    rent: round2(mods.rent),
    cogs,
    profit: round2(revenue - cogs - mods.rent),
    used,
    repDelta,
  };
  result.notes = customerNotes(state.recipe, today.temp, result, mods);
  return result;
}

/** Apply a simulated day to the state and move the calendar forward. */
export function commitDay(state, result) {
  const days = state.days ?? TOTAL_DAYS;
  state.money = round2(state.money + result.revenue - (result.rent || 0));
  state.inventory.lemons -= result.used.lemons;
  state.inventory.sugar -= result.used.sugar;
  state.inventory.cups -= result.used.cups;
  result.melted = Math.max(0, state.inventory.ice - result.used.ice);
  state.inventory.ice = 0; // whatever is left melts overnight
  state.reputation = clamp(state.reputation + result.repDelta, 0.05, 1);
  state.history.push(result);
  state.day += 1;
  if (state.day > days) {
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
  const net = round2(state.money - state.stake);
  return {
    money: round2(state.money),
    net,
    revenue: round2(totals.revenue),
    profit: round2(totals.profit),
    cupsSold: totals.sold,
    bestDay: best,
    reputation: state.reputation,
    target: state.target,
    won: state.target == null ? null : net >= state.target,
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

/* ------------------------------------------------------------------ *
 * Reference play
 *
 * A near-optimal bot used to set each corner's target ("par"). Because the
 * bot plays the corner's own weather, prices and modifiers, a target derived
 * from its result is calibrated to that corner automatically — a rainy city
 * with fussy customers gets an honestly lower bar than a tourist trap.
 * ------------------------------------------------------------------ */

/** What the crowd will pay on average today, for a given drink quality. */
export function willingnessToday(state, quality) {
  const mods = withMods(state.mods);
  const heat = clamp((state.today.temp - 48) / 46, 0, 1);
  return (0.1 + 1.35 * quality + 0.7 * heat) * mods.willingness;
}

/**
 * Revenue-maximising price. Budgets are spread uniformly over 0.6–1.4× the
 * average, so the take is p·(1.4 − p/w)/0.8 and the peak sits at 0.7·w.
 */
export function bestPrice(state, quality) {
  return Math.max(0.05, Math.round(0.7 * willingnessToday(state, quality) * 20) / 20);
}

/** Share of passers-by who would buy at `price` today. */
export function demandShare(state, quality, price) {
  const w = willingnessToday(state, quality);
  return clamp((1.4 - price / w) / 0.8, 0, 1);
}

/** Roughly how many people will walk past today. */
export function expectedTraffic(state) {
  const heat = clamp((state.today.temp - 48) / 46, 0, 1);
  const thirst = 0.35 + 1.25 * heat * heat;
  return 22 * thirst * state.today.trafficMod * (0.45 + 1.1 * state.reputation);
}

/** How the reference bot would play today: ideal recipe, best price, stock to match. */
export function referencePlan(state) {
  const mods = withMods(state.mods);
  const recipe = { lemons: IDEAL_LEMONS, sugar: IDEAL_SUGAR, ice: idealIcePerCup(state.today.temp, mods) };
  const quality = recipeQuality(recipe, state.today.temp, mods);
  const price = bestPrice(state, quality);
  const expected = expectedTraffic(state) * demandShare(state, quality, price);
  return { recipe, price, cups: Math.max(0, Math.round(expected * 1.05)) };
}

/** Buy what's missing to pour `cups` cups, trimmed to what the money covers. */
export function affordableOrder(state, recipe, cups) {
  const prices = state.today.prices;
  const need = (have, want) => Math.max(0, want - have);
  const orderFor = (n) => {
    const pitchers = Math.ceil(n / CUPS_PER_PITCHER);
    return {
      lemons: need(state.inventory.lemons, pitchers * recipe.lemons),
      sugar: need(state.inventory.sugar, pitchers * recipe.sugar),
      ice: need(state.inventory.ice, n * recipe.ice),
      cups: need(state.inventory.cups, n),
    };
  };
  if (buyCost(prices, orderFor(cups)) <= state.money) return orderFor(cups);
  let lo = 0;
  let hi = cups;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (buyCost(prices, orderFor(mid)) <= state.money) lo = mid;
    else hi = mid - 1;
  }
  return orderFor(lo);
}

/**
 * Play a whole run with the reference bot and report the profit it cleared.
 * This is what corner targets are measured against.
 */
export function parProfit(config) {
  const state = newRun({ ...config, target: null });
  while (state.phase !== 'gameover') {
    const plan = referencePlan(state);
    state.recipe = plan.recipe;
    state.price = plan.price;
    const order = affordableOrder(state, plan.recipe, plan.cups);
    state.money = round2(state.money - buyCost(state.today.prices, order));
    for (const key of Object.keys(order)) state.inventory[key] += order[key];
    commitDay(state, simulateDay(state));
  }
  return round2(state.money - state.stake);
}
