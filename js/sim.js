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

/* ------------------------------------------------------------------ *
 * Lemons spoil
 *
 * Lemons are tracked as dated batches, not just a running total, so a
 * cooler full of them can go bad. Everything else (sugar, cups, ice-per-day)
 * keeps indefinitely — only the fruit itself is perishable.
 * ------------------------------------------------------------------ */

export const LEMON_SHELF_LIFE_DAYS = 7;

/** Add lemons to the cooler, dated so they can spoil on schedule. */
export function receiveLemons(state, qty) {
  if (qty <= 0) return;
  state.inventory.lemons += qty;
  const batches = state.inventory.lemonBatches || (state.inventory.lemonBatches = []);
  batches.push({ day: state.day, qty });
}

/**
 * A full shopping order: lemons go through receiveLemons so they can spoil
 * on schedule, an `enhancers` sub-order tops up enhancer stock, and the rest
 * (sugar, ice, cups) adds straight in.
 */
export function receiveOrder(state, order) {
  for (const key of Object.keys(order)) {
    if (key === 'lemons') {
      receiveLemons(state, order.lemons || 0);
    } else if (key === 'enhancers') {
      for (const [id, qty] of Object.entries(order.enhancers || {})) {
        state.inventory.enhancers[id] = (state.inventory.enhancers[id] || 0) + (qty || 0);
      }
    } else {
      state.inventory[key] = (state.inventory[key] || 0) + (order[key] || 0);
    }
  }
}

/** Use the oldest lemons first, so the freshest batch is the one left to spoil last. */
function consumeLemons(state, qty) {
  let remaining = qty;
  const batches = state.inventory.lemonBatches || [];
  while (remaining > 0 && batches.length) {
    const take = Math.min(remaining, batches[0].qty);
    batches[0].qty -= take;
    remaining -= take;
    if (batches[0].qty <= 0) batches.shift();
  }
  state.inventory.lemons = Math.max(0, state.inventory.lemons - qty);
}

/**
 * Discard any batch older than the shelf life, as of the current day. A
 * never-expire unlock skips this entirely — the one thing real money buys.
 */
function spoilLemons(state) {
  if (state.premium?.neverExpireLemons) return 0;
  const batches = state.inventory.lemonBatches || [];
  let spoiled = 0;
  const fresh = [];
  for (const b of batches) {
    if (state.day - b.day >= LEMON_SHELF_LIFE_DAYS) spoiled += b.qty;
    else fresh.push(b);
  }
  state.inventory.lemonBatches = fresh;
  if (spoiled > 0) state.inventory.lemons = Math.max(0, state.inventory.lemons - spoiled);
  return spoiled;
}

/** How many days the oldest lemon in the cooler has left before it spoils. */
export function daysUntilLemonsSpoil(state) {
  const batches = state.inventory.lemonBatches || [];
  if (!batches.length) return null;
  const age = state.day - batches[0].day;
  return Math.max(0, LEMON_SHELF_LIFE_DAYS - age);
}

/* ------------------------------------------------------------------ *
 * Enhancers — optional add-ins customers can pay extra for
 * ------------------------------------------------------------------ */

export const ENHANCERS = {
  strawberry: { id: 'strawberry', label: 'Strawberry Splash', icon: '🍓', addPrice: 0.35, unitCost: 0.16, appeal: 1.0 },
  mango:      { id: 'mango',      label: 'Mango Twist',       icon: '🥭', addPrice: 0.4,  unitCost: 0.2,  appeal: 0.9 },
  mint:       { id: 'mint',       label: 'Mint Cooler',       icon: '🌿', addPrice: 0.3,  unitCost: 0.12, appeal: 1.0, coolant: true },
  caffeine:   { id: 'caffeine',   label: 'Caffeine Kick',     icon: '☕', addPrice: 0.55, unitCost: 0.24, appeal: 0.75 },
};

const emptyEnhancerInventory = () =>
  Object.fromEntries(Object.keys(ENHANCERS).map((id) => [id, 0]));
const allEnhancersOff = () =>
  Object.fromEntries(Object.keys(ENHANCERS).map((id) => [id, false]));

/** How likely a customer who is already buying is to add this enhancer too. */
function enhancerUptake(enh, heat) {
  let chance = 0.55 * enh.appeal - 0.4 * enh.addPrice;
  if (enh.coolant) chance *= 1 + heat * 0.35; // a cool add-on sells better when it's hot
  return clamp(chance, 0, 0.9);
}

/* ------------------------------------------------------------------ *
 * Cup sizes
 *
 * "Medium" is the size the original game always had — it still lives on
 * `state.price` and `inventory.cups`, untouched, so a player who never
 * touches small, large or BYO gets bit-for-bit the same day the game has
 * always simulated. The other sizes share the same pitcher: a large cup
 * just claims more of it, in the same currency (`servingMult`) that a
 * pitcher is metered in.
 * ------------------------------------------------------------------ */

export const CUP_SIZES = {
  small:  { id: 'small',  label: 'Small',  icon: '🥤', material: 'Paper',     share: 0.4,  servingMult: 0.7, costMult: 0.55 },
  medium: { id: 'medium', label: 'Medium', icon: '🧋', material: 'Styrofoam', share: 0.35, servingMult: 1.0, costMult: 1.0 },
  large:  { id: 'large',  label: 'Large',  icon: '🧋', material: 'Styrofoam', share: 0.25, servingMult: 1.4, costMult: 1.6 },
};

// Customers who'd bring their own cup if you'd let them — a bonus on top of
// the regular crowd, not carved out of it, since they weren't going to take
// a disposable cup either way.
export const BYO_SHARE = 0.15;

/** Bigger cups feel like better value, but not in strict proportion to size. */
function sizeWillingnessMult(servingMult) {
  return Math.pow(servingMult, 0.6);
}

/** How many medium-equivalent servings the lemons and sugar alone allow — no ice, no cup count. */
export function maxServingsFromLiquid(inventory, recipe) {
  const byLemons = Math.floor(inventory.lemons / Math.max(1, recipe.lemons));
  const bySugar = Math.floor(inventory.sugar / Math.max(1, recipe.sugar));
  return Math.min(byLemons, bySugar) * CUPS_PER_PITCHER;
}

/** What one cup of `sizeId` costs to make, at today's prices. */
export function costPerCupSized(recipe, prices, sizeId) {
  const size = CUP_SIZES[sizeId];
  const mult = size ? size.servingMult : 1;
  const perServing = (recipe.lemons * prices.lemon + recipe.sugar * prices.sugar) / CUPS_PER_PITCHER;
  const ice = Math.round(recipe.ice * mult) * prices.ice;
  const cup = sizeId === 'byo' ? 0 : prices.cup * (size ? size.costMult : 1);
  return round2(perServing * mult + ice + cup);
}

/**
 * Sell one size for the day against what's left of the shared pitcher and
 * ice pool. Pure — the caller deducts what actually sold before selling the
 * next size. For medium alone, given the full pool and nothing held back,
 * this reproduces the original single-size loop's numbers precisely.
 */
function sellSize({ potential, price, willingness, cupStock, servingMult, iceEach, remainingServings, remainingIce, rng }) {
  let interested = 0;
  for (let i = 0; i < potential; i++) {
    const personal = willingness * (0.6 + rng() * 0.8);
    if (price <= personal) interested++;
  }
  const byLiquid = servingMult > 0 ? Math.floor(remainingServings / servingMult) : Infinity;
  const byIce = iceEach > 0 ? Math.floor(remainingIce / iceEach) : Infinity;
  const stock = Math.max(0, Math.min(cupStock, byLiquid, byIce));
  const sold = Math.min(interested, stock);
  return { potential, interested, sold, stock, lostToStockout: Math.max(0, interested - sold) };
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
  premium = null,
} = {}) {
  const state = {
    seed,
    day: 1,
    days,
    stake,
    target,
    corner,               // { cityId, index, name } when played from the campaign
    mods: withMods(mods),
    premium: { neverExpireLemons: false, ...(premium || {}) },
    money: stake,
    reputation: 0.5,
    inventory: {
      lemons: 0, sugar: 0, ice: 0, cups: 0, cupsSmall: 0, cupsLarge: 0,
      lemonBatches: [], enhancers: emptyEnhancerInventory(),
    },
    enhancersOffered: allEnhancersOff(),
    recipe: { lemons: 5, sugar: 5, ice: 2 },
    price: 0.5,                                    // the medium price — unchanged from the original game
    cupPrices: { small: 0.35, large: 0.7, byo: 0.5 },
    byoAccepted: false,
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

/** Small and large cups ride the same daily cup price, scaled by material and size. */
export function sizedCupOrderCost(prices, order) {
  return round2(
    (order.cupsSmall || 0) * prices.cup * CUP_SIZES.small.costMult +
    (order.cupsLarge || 0) * prices.cup * CUP_SIZES.large.costMult
  );
}

/** Enhancer stock has a fixed wholesale price — no daily jitter, no bulk break. */
export function enhancerOrderCost(order) {
  return round2(
    Object.entries(order || {}).reduce((sum, [id, qty]) => sum + (ENHANCERS[id]?.unitCost || 0) * (qty || 0), 0)
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

  // What a passer-by would pay: better lemonade and hotter days raise it.
  const baseWillingness = (0.1 + 1.35 * quality + 0.7 * heat) * mods.willingness;

  // Medium is always on offer. Small and large only enter the mix once
  // there's actual stock of them, and BYO only once you've said you'll take
  // it — so a player who never touches any of that gets 100% of `potential`
  // routed to medium, exactly like the original single-size game did.
  const smallOn = (state.inventory.cupsSmall || 0) > 0;
  const largeOn = (state.inventory.cupsLarge || 0) > 0;
  const byoOn = !!state.byoAccepted;
  const activeShare = CUP_SIZES.medium.share + (smallOn ? CUP_SIZES.small.share : 0) + (largeOn ? CUP_SIZES.large.share : 0);

  const potentialFor = (size) => (size === 'medium' && !smallOn && !largeOn)
    ? potential
    : Math.round(potential * (CUP_SIZES[size].share / activeShare));

  let remainingServings = maxServingsFromLiquid(state.inventory, state.recipe);
  let remainingIce = state.inventory.ice;
  const sizeResults = {};

  // Fixed serving order: medium first (the default anyone can buy), then
  // small, then large, then BYO — whoever is last only gets what's left of
  // a tight pitcher. Only matters when stock is actually scarce.
  const order = ['medium', ...(smallOn ? ['small'] : []), ...(largeOn ? ['large'] : [])];
  for (const id of order) {
    const size = CUP_SIZES[id];
    const cupStock = id === 'medium' ? state.inventory.cups : id === 'small' ? state.inventory.cupsSmall : state.inventory.cupsLarge;
    const price = id === 'medium' ? state.price : state.cupPrices[id];
    const iceEach = Math.round(state.recipe.ice * size.servingMult);
    const r = sellSize({
      potential: potentialFor(id),
      price,
      willingness: baseWillingness * sizeWillingnessMult(size.servingMult),
      cupStock,
      servingMult: size.servingMult,
      iceEach,
      remainingServings,
      remainingIce,
      rng,
    });
    remainingServings -= r.sold * size.servingMult;
    remainingIce -= r.sold * iceEach;
    sizeResults[id] = { ...r, price, iceEach, revenue: round2(r.sold * price) };
  }
  if (byoOn) {
    const iceEach = Math.round(state.recipe.ice); // sized like medium
    const r = sellSize({
      potential: Math.round(potential * BYO_SHARE),
      price: state.cupPrices.byo,
      willingness: baseWillingness,
      cupStock: Infinity, // the customer's own cup, not yours to run out of
      servingMult: 1,
      iceEach,
      remainingServings,
      remainingIce,
      rng,
    });
    remainingServings -= r.sold;
    remainingIce -= r.sold * iceEach;
    sizeResults.byo = { ...r, price: state.cupPrices.byo, iceEach, revenue: round2(r.sold * state.cupPrices.byo) };
  }

  const sold = Object.values(sizeResults).reduce((n, r) => n + r.sold, 0);
  const potentialTotal = Object.values(sizeResults).reduce((n, r) => n + r.potential, 0);
  const interested = Object.values(sizeResults).reduce((n, r) => n + r.interested, 0);
  const stock = Object.values(sizeResults).reduce((n, r) => n + r.stock, 0);
  const lostToStockout = Object.values(sizeResults).reduce((n, r) => n + r.lostToStockout, 0);
  const baseRevenue = Object.values(sizeResults).reduce((n, r) => n + r.revenue, 0);
  // What you actually charged, on average, across every size sold — used
  // below in place of a single `state.price` now that there can be several.
  const avgPrice = sold > 0 ? baseRevenue / sold : state.price;

  const totalServings = sold === 0
    ? 0
    : Object.entries(sizeResults).reduce((n, [id, r]) => n + r.sold * (id === 'byo' ? 1 : CUP_SIZES[id].servingMult), 0);
  const pitchersMade = Math.ceil(totalServings / CUPS_PER_PITCHER);
  const iceUsed = Object.values(sizeResults).reduce((n, r) => n + r.sold * r.iceEach, 0);
  const cupCost = ['small', 'medium', 'large'].reduce((n, id) => {
    const r = sizeResults[id];
    return r ? n + r.sold * today.prices.cup * CUP_SIZES[id].costMult : n;
  }, 0);

  // Enhancers are an independent upsell: every cup sold is offered whichever
  // ones are switched on and still in stock, and each customer decides for
  // themself — it never affects whether the base cup gets bought at all.
  const enhancerSales = {};
  let enhancerRevenue = 0;
  let enhancerCost = 0;
  for (const id of Object.keys(ENHANCERS)) {
    if (!state.enhancersOffered?.[id]) continue;
    let stockLeft = state.inventory.enhancers?.[id] || 0;
    if (stockLeft <= 0) continue;
    const enh = ENHANCERS[id];
    const uptake = enhancerUptake(enh, heat);
    let usedCount = 0;
    for (let i = 0; i < sold && stockLeft > 0; i++) {
      if (rng() < uptake) {
        usedCount++;
        stockLeft--;
      }
    }
    if (usedCount > 0) {
      enhancerSales[id] = { cups: usedCount, revenue: round2(usedCount * enh.addPrice), cost: round2(usedCount * enh.unitCost) };
      enhancerRevenue += usedCount * enh.addPrice;
      enhancerCost += usedCount * enh.unitCost;
    }
  }

  const used = {
    lemons: pitchersMade * state.recipe.lemons,
    sugar: pitchersMade * state.recipe.sugar,
    ice: iceUsed,
    cups: sizeResults.medium.sold,
    cupsSmall: sizeResults.small?.sold || 0,
    cupsLarge: sizeResults.large?.sold || 0,
    enhancers: Object.fromEntries(Object.entries(enhancerSales).map(([id, s]) => [id, s.cups])),
  };
  const revenue = round2(baseRevenue + enhancerRevenue);
  const cogs = round2(
    pitchersMade * (state.recipe.lemons * today.prices.lemon + state.recipe.sugar * today.prices.sugar) +
    iceUsed * today.prices.ice +
    cupCost +
    enhancerCost
  );

  // Reputation follows the drink first, then how you priced it. Word only
  // spreads through cups actually sold, and the last stretch to a perfect
  // reputation is the hardest to earn.
  const valueForMoney = clamp(baseWillingness - avgPrice, -1, 1);
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
    price: avgPrice,
    sizes: sizeResults,
    revenue,
    rent: round2(mods.rent),
    cogs,
    profit: round2(revenue - cogs - mods.rent),
    used,
    enhancers: enhancerSales,
    enhancerRevenue: round2(enhancerRevenue),
    repDelta,
  };
  result.notes = customerNotes(state.recipe, today.temp, result, mods);
  return result;
}

/** Apply a simulated day to the state and move the calendar forward. */
export function commitDay(state, result) {
  const days = state.days ?? TOTAL_DAYS;
  state.money = round2(state.money + result.revenue - (result.rent || 0));
  consumeLemons(state, result.used.lemons);
  state.inventory.sugar -= result.used.sugar;
  state.inventory.cups -= result.used.cups;
  state.inventory.cupsSmall -= result.used.cupsSmall || 0;
  state.inventory.cupsLarge -= result.used.cupsLarge || 0;
  for (const [id, qty] of Object.entries(result.used.enhancers || {})) {
    state.inventory.enhancers[id] = Math.max(0, (state.inventory.enhancers[id] || 0) - qty);
  }
  result.melted = Math.max(0, state.inventory.ice - result.used.ice);
  state.inventory.ice = 0; // whatever is left melts overnight
  state.reputation = clamp(state.reputation + result.repDelta, 0.05, 1);
  state.history.push(result);
  state.day += 1;
  result.spoiledLemons = spoilLemons(state); // checked as of the day that's about to start
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
/** Whether there's a way to pour at least one cup of `sizeId` right now. */
function canPourSize(inventory, recipe, sizeId) {
  if (sizeId === 'medium') return maxCupsAvailable(inventory, recipe) > 0;
  const size = CUP_SIZES[sizeId];
  const cupStock = sizeId === 'small' ? inventory.cupsSmall : inventory.cupsLarge;
  if (!(cupStock > 0)) return false;
  const iceEach = Math.round(recipe.ice * size.servingMult);
  const byLiquid = size.servingMult > 0 ? Math.floor(maxServingsFromLiquid(inventory, recipe) / size.servingMult) : Infinity;
  const byIce = iceEach > 0 ? Math.floor(inventory.ice / iceEach) : Infinity;
  return Math.min(byLiquid, byIce) > 0;
}

export function isBankrupt(state) {
  if (canPourSize(state.inventory, state.recipe, 'medium')) return false;
  if (canPourSize(state.inventory, state.recipe, 'small')) return false;
  if (canPourSize(state.inventory, state.recipe, 'large')) return false;
  if (state.byoAccepted && maxServingsFromLiquid(state.inventory, state.recipe) > 0 &&
      (state.recipe.ice === 0 || state.inventory.ice >= state.recipe.ice)) return false;
  const p = state.today.prices;
  const cheapestCup = p.lemon + p.sugar + p.cup * CUP_SIZES.small.costMult;
  return state.money < cheapestCup;
}

export function finalScore(state) {
  const totals = state.history.reduce(
    (acc, d) => {
      acc.revenue += d.revenue;
      acc.profit += d.profit;
      acc.sold += d.sold;
      acc.enhancerCups += Object.values(d.used?.enhancers || {}).reduce((a, b) => a + b, 0);
      acc.enhancerRevenue += d.enhancerRevenue || 0;
      return acc;
    },
    { revenue: 0, profit: 0, sold: 0, enhancerCups: 0, enhancerRevenue: 0 }
  );
  const best = state.history.reduce((a, b) => (b.profit > (a?.profit ?? -Infinity) ? b : a), null);
  const net = round2(state.money - state.stake);
  return {
    money: round2(state.money),
    net,
    revenue: round2(totals.revenue),
    profit: round2(totals.profit),
    cupsSold: totals.sold,
    enhancerCups: totals.enhancerCups,
    enhancerRevenue: round2(totals.enhancerRevenue),
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
    receiveOrder(state, order);
    commitDay(state, simulateDay(state));
  }
  return round2(state.money - state.stake);
}
