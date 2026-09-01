/**
 * The Round — day simulation.
 *
 * A "run" is one contract season on one neighbourhood: a round of client
 * lawns scattered across a map, a working day that runs out, and grass that
 * keeps growing whether or not you turn up.
 *
 * The decision every morning is a route — which lawns, in what order. That is
 * a travelling-salesman problem with deadlines and decay bolted on: the far
 * corner pays well but costs you the drive, the shaggy lawn takes longer the
 * longer you leave it, and a client whose patience runs out is gone for the
 * rest of the season along with their money.
 *
 * Everything here is pure: give it a state object and it gives numbers back.
 * No DOM, no storage. campaign.js decides which runs exist; app.js draws them.
 */

export const WORK_MINUTES = 480;        // eight hours, before weather takes its cut
export const MINUTES_PER_UNIT = 0.8;    // travel time per unit of map distance
export const MINUTES_PER_SIZE = 6;      // mowing time per unit of lawn
export const SHARPEN_MINUTES = 25;
export const SHARPEN_COST = 6;
export const IDEAL_HEIGHT = 5;          // cm; above this the mowing slows down
export const DUE_HEIGHT = 4.5;          // cm; below this there is nothing worth cutting
export const START_MONEY = 60;
export const MAP_SIZE = 100;
export const DEPOT = { x: 50, y: 50 };  // where the van starts and ends

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

/* ------------------------------------------------------------------ *
 * Modifiers — every knob a neighbourhood, town or tier can turn
 * ------------------------------------------------------------------ */

export const NO_MODS = {
  spread: 1,          // how far apart the properties sit
  travel: 1,          // multiplies travel time (hills, traffic, one-way systems)
  growth: 1,          // how fast the grass comes back
  wetBias: 1,         // how often it rains
  fussiness: 1,       // how hard the clients are to please
  rate: 1,            // what a visit pays
  dulling: 1,         // how fast blades go blunt (sand, grit, tough grass)
  slope: 1,           // multiplies mowing time
  clients: 1,         // how many lawns are on the round
  offerChance: 1,     // how often new work is offered
  lawnSize: 1,        // how big the lawns are
};

export function withMods(mods) {
  return { ...NO_MODS, ...(mods || {}) };
}

/* ------------------------------------------------------------------ *
 * Weather
 * ------------------------------------------------------------------ */

export const WEATHER = {
  clear:    { id: 'clear',    label: 'Clear',      icon: '☀️', workable: 1.0,  growth: 1.0, wet: false },
  overcast: { id: 'overcast', label: 'Overcast',   icon: '☁️', workable: 1.0,  growth: 1.1, wet: false },
  heat:     { id: 'heat',     label: 'Heatwave',   icon: '🔥', workable: 0.85, growth: 0.55, wet: false },
  showers:  { id: 'showers',  label: 'Showers',    icon: '🌦️', workable: 0.72, growth: 1.5, wet: true },
  storm:    { id: 'storm',    label: 'Downpour',   icon: '⛈️', workable: 0.3,  growth: 1.7, wet: true },
};

function pickWeather(rng, mods) {
  const weights = [
    [WEATHER.clear, 0.30],
    [WEATHER.overcast, 0.26],
    [WEATHER.heat, 0.1],
    [WEATHER.showers, 0.22 * mods.wetBias],
    [WEATHER.storm, 0.12 * mods.wetBias],
  ];
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let roll = rng() * total;
  for (const [w, weight] of weights) {
    roll -= weight;
    if (roll <= 0) return w;
  }
  return WEATHER.clear;
}

/* ------------------------------------------------------------------ *
 * The round
 * ------------------------------------------------------------------ */

const STREETS = ['Ash', 'Beech', 'Cedar', 'Elm', 'Fir', 'Hawthorn', 'Laurel', 'Maple',
  'Oak', 'Poplar', 'Rowan', 'Sycamore', 'Willow', 'Yew', 'Alder', 'Birch'];
const SUFFIX = ['Road', 'Close', 'Avenue', 'Drive', 'Lane', 'Way', 'Crescent', 'Gardens'];

/**
 * Build the round. Client expectations and fussiness are rolled here and
 * never shown — the player infers them from what people say.
 */
function buildRound(rng, mods, count) {
  const properties = [];
  for (let i = 0; i < count; i++) {
    const size = (2 + rng() * 9) * mods.lawnSize;
    const expectedGap = Math.round(5 + rng() * 7);          // hidden
    const fussiness = (0.6 + rng() * 1.0) * mods.fussiness;  // hidden
    const spread = mods.spread;
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 46 * spread;
    properties.push({
      id: i,
      name: `${1 + Math.floor(rng() * 98)} ${STREETS[Math.floor(rng() * STREETS.length)]} ${SUFFIX[Math.floor(rng() * SUFFIX.length)]}`,
      x: clamp(DEPOT.x + Math.cos(angle) * radius, 2, MAP_SIZE - 2),
      y: clamp(DEPOT.y + Math.sin(angle) * radius, 2, MAP_SIZE - 2),
      size: round2(size),
      rate: round2((9 + size * 3.1) * mods.rate),
      expectedGap,
      fussiness: round2(fussiness),
      // Stagger the round so it does not all fall due on day one.
      lastCut: -Math.floor(rng() * expectedGap),
      height: 0,
      patience: 0.75,
      active: true,
      complaints: [],
      visits: 0,
    });
  }
  for (const p of properties) {
    p.height = round2(Math.max(0, -p.lastCut) * 0.9 * mods.growth + 2);
  }
  return properties;
}

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const travelMinutes = (a, b, mods) =>
  distance(a, b) * MINUTES_PER_UNIT * mods.travel;

/** How long this lawn takes today, given its state and yours. */
export function mowMinutes(property, state) {
  const mods = state.mods;
  const heightFactor = 1 + Math.max(0, property.height - IDEAL_HEIGHT) / 14;
  const wetFactor = state.today.wet ? 1.25 : 1;
  const dullFactor = 1 + (1 - state.sharpness) * 0.35;
  return property.size * MINUTES_PER_SIZE * mods.slope * heightFactor * wetFactor * dullFactor;
}

/** How good the cut is, 0..1. Blunt blades and wet, overgrown grass all show. */
export function cutQuality(property, state) {
  const overgrown = Math.max(0, property.height - IDEAL_HEIGHT) / 22;
  return clamp(
    0.55 + 0.45 * state.sharpness - (state.today.wet ? 0.16 : 0) - Math.min(0.3, overgrown),
    0, 1
  );
}

/** The finish this client considers acceptable. Never shown. */
export const qualityBar = (property) => clamp(0.5 + 0.22 * property.fussiness, 0, 0.95);

/**
 * Is there anything to cut?
 *
 * A contract pays per visit, so without this the whole game collapses into
 * mowing the three nearest lawns every single day. Grass has to have grown
 * before a visit is worth anything — turning up early is a wasted hour and
 * a faintly irritated client.
 */
export const isDue = (property) => property.height >= DUE_HEIGHT;

export const daysSinceCut = (property, day) => day - property.lastCut;
export const isOverdue = (property, day) => daysSinceCut(property, day) > property.expectedGap;

/* ------------------------------------------------------------------ *
 * Starting a run
 * ------------------------------------------------------------------ */

export function newRun({
  seed = Math.floor(Math.random() * 1e9),
  days = 18,
  stake = START_MONEY,
  target = null,
  mods = null,
  neighbourhood = null,
} = {}) {
  const m = withMods(mods);
  const rng = mulberry32(seed ^ 0x2f6a5b1d);
  const count = Math.max(6, Math.round((16 + rng() * 9) * m.clients));

  const state = {
    seed,
    day: 1,
    days,
    stake,
    target,
    neighbourhood,
    mods: m,
    properties: buildRound(rng, m, count),
    money: stake,
    sharpness: 1,
    route: [],
    sharpenToday: false,
    offer: null,
    lost: [],
    history: [],
    today: null,
    phase: 'forecast',
  };
  state.today = rollDay(state);
  return state;
}

/** Weather, and any new work going, for the day about to start. */
export function rollDay(state) {
  const mods = withMods(state.mods);
  const rng = mulberry32(state.seed + state.day * 7919);
  const weather = pickWeather(rng, mods);
  const yesterday = state.history[state.history.length - 1];
  // The morning after a downpour the grass is still soaking.
  const wet = weather.wet || (yesterday && WEATHER[yesterday.weather]?.id === 'storm');

  let offer = null;
  const active = state.properties.filter((p) => p.active).length;
  if (rng() < 0.16 * mods.offerChance && active < 34) {
    const size = (2 + rng() * 8) * mods.lawnSize;
    const angle = rng() * Math.PI * 2;
    const radius = Math.sqrt(rng()) * 46 * mods.spread;
    offer = {
      name: `${1 + Math.floor(rng() * 98)} ${STREETS[Math.floor(rng() * STREETS.length)]} ${SUFFIX[Math.floor(rng() * SUFFIX.length)]}`,
      x: clamp(DEPOT.x + Math.cos(angle) * radius, 2, MAP_SIZE - 2),
      y: clamp(DEPOT.y + Math.sin(angle) * radius, 2, MAP_SIZE - 2),
      size: round2(size),
      rate: round2((9 + size * 3.1) * mods.rate),
      expectedGap: Math.round(5 + rng() * 7),
      fussiness: round2((0.6 + rng() * 1.0) * mods.fussiness),
      signing: Math.round(8 + size * 2),
    };
  }

  return {
    weather: weather.id,
    wet: Boolean(wet),
    workable: Math.round(WORK_MINUTES * weather.workable),
    growth: weather.growth,
    offer,
  };
}

/** Take on the lawn being offered this morning. */
export function acceptOffer(state) {
  const offer = state.today.offer;
  if (!offer) return false;
  state.properties.push({
    id: state.properties.length,
    name: offer.name,
    x: offer.x, y: offer.y,
    size: offer.size,
    rate: offer.rate,
    expectedGap: offer.expectedGap,
    fussiness: offer.fussiness,
    lastCut: state.day,          // freshly cut when they signed up
    height: 2,
    patience: 0.75,
    active: true,
    complaints: [],
    visits: 0,
  });
  state.money = round2(state.money + offer.signing);
  state.today.offer = null;
  return true;
}

/* ------------------------------------------------------------------ *
 * The day
 * ------------------------------------------------------------------ */

/** Minutes the planned route needs, and how far down it you actually get. */
export function planRoute(state, route) {
  const mods = state.mods;
  let at = DEPOT;
  let spent = state.sharpenToday ? SHARPEN_MINUTES : 0;
  let sharpness = state.sharpenToday ? 1 : state.sharpness;
  const legs = [];

  for (const id of route) {
    const p = state.properties[id];
    if (!p || !p.active) continue;
    const drive = travelMinutes(at, p, mods);
    const dullFactor = 1 + (1 - sharpness) * 0.35;
    const heightFactor = 1 + Math.max(0, p.height - IDEAL_HEIGHT) / 14;
    const wetFactor = state.today.wet ? 1.25 : 1;
    const mow = p.size * MINUTES_PER_SIZE * mods.slope * heightFactor * wetFactor * dullFactor;
    const home = travelMinutes(p, DEPOT, mods);

    // The van has to get back, so a job only fits if the return leg fits too.
    const fits = spent + drive + mow + home <= state.today.workable;
    legs.push({ id, drive, mow, fits, sharpnessAt: sharpness });
    if (!fits) break;
    spent += drive + mow;
    sharpness = clamp(sharpness - p.size * 0.012 * mods.dulling, 0.15, 1);
    at = p;
  }
  const back = legs.some((l) => l.fits) ? travelMinutes(at, DEPOT, mods) : 0;
  return {
    legs,
    minutes: round2(spent + back),
    drive: round2(legs.filter((l) => l.fits).reduce((n, l) => n + l.drive, 0) + back),
    fits: legs.every((l) => l.fits),
    doable: legs.filter((l) => l.fits).map((l) => l.id),
  };
}

/**
 * Work the day. Pure: reads the state and the route already set on it and
 * returns a report, including the end state of the round.
 */
export function simulateDay(state) {
  const mods = state.mods;
  const plan = planRoute(state, state.route);
  const done = new Set(plan.doable);

  let money = state.money;
  let sharpness = state.sharpenToday ? 1 : state.sharpness;
  if (state.sharpenToday) money = round2(money - SHARPEN_COST);

  const jobs = [];
  const properties = state.properties.map((p) => ({ ...p, complaints: [...p.complaints] }));

  // --- the lawns you got to
  for (const id of plan.doable) {
    const p = properties[id];
    const due = isDue(p);
    const quality = cutQuality(p, { ...state, sharpness });
    const overdueBy = Math.max(0, daysSinceCut(p, state.day) - p.expectedGap);
    const bar = qualityBar(p);
    const paid = due ? p.rate : 0;

    money = round2(money + paid);
    // People forgive a good cut and remember a bad one, so the downside is
    // far steeper than the upside. This is what makes a blunt blade cost
    // contracts rather than just minutes.
    const gap = quality - bar;
    const delta = due
      ? clamp(
          (gap >= 0 ? 0.12 * gap : 0.5 * gap) -
            0.055 * (overdueBy / Math.max(1, p.expectedGap)) * p.fussiness,
          -0.3, 0.12
        )
      : -0.03;   // turning up to cut nothing wears on people
    p.patience = clamp(p.patience + delta, 0, 1);
    p.lastCut = state.day;
    p.height = 1.2;
    if (due) p.visits += 1;
    sharpness = clamp(sharpness - p.size * 0.012 * mods.dulling, 0.15, 1);

    jobs.push({ id, name: p.name, rate: paid, due, quality, overdueBy, delta,
      note: due ? jobNote(quality, bar, overdueBy, state.today.wet)
                : 'You were only just here. There was nothing to cut.' });
  }

  // --- the lawns you did not
  const neglected = [];
  for (const p of properties) {
    if (!p.active || done.has(p.id)) continue;
    const overdueBy = Math.max(0, daysSinceCut(p, state.day) - p.expectedGap);
    const delta = overdueBy > 0
      ? -0.04 * p.fussiness * (1 + overdueBy / p.expectedGap)
      : 0.012;
    p.patience = clamp(p.patience + delta, 0, 1);
    if (overdueBy > 0) neglected.push({ id: p.id, name: p.name, overdueBy });
  }

  // --- who walked
  const lost = [];
  for (const p of properties) {
    if (p.active && p.patience <= 0) {
      p.active = false;
      lost.push({ id: p.id, name: p.name, rate: p.rate });
    }
  }

  // --- overnight growth
  const growth = 0.9 * mods.growth * state.today.growth;
  for (const p of properties) {
    if (p.active) p.height = round2(p.height + growth);
  }

  const fuel = round2(plan.drive * 0.06 + plan.legs.filter((l) => l.fits)
    .reduce((n, l) => n + l.mow, 0) * 0.1);
  money = round2(money - fuel);

  const earned = round2(jobs.reduce((n, j) => n + j.rate, 0));

  return {
    day: state.day,
    weather: state.today.weather,
    wet: state.today.wet,
    workable: state.today.workable,
    minutes: plan.minutes,
    drive: plan.drive,
    sharpened: state.sharpenToday,
    jobs,
    skipped: state.route.length - plan.doable.length,
    neglected,
    lost,
    earned,
    fuel,
    profit: round2(earned - fuel - (state.sharpenToday ? SHARPEN_COST : 0)),
    next: { properties, money, sharpness },
  };
}

function jobNote(quality, bar, overdueBy, wet) {
  if (overdueBy >= 5) return 'It was a hayfield by the time you came.';
  if (overdueBy >= 2) return 'It was getting a bit shaggy.';
  if (quality < bar - 0.15) return 'They looked at the finish and said nothing, twice.';
  if (quality < bar) return 'Looks like you were in a hurry.';
  if (wet && quality >= bar) return 'Good job, considering the wet.';
  if (quality > bar + 0.15) return 'They came out to say it looks a picture.';
  return 'No complaints.';
}

/** Apply a worked day and move the calendar forward. */
export function commitDay(state, result) {
  state.properties = result.next.properties;
  state.money = result.next.money;
  state.sharpness = result.next.sharpness;
  state.lost.push(...result.lost);

  result.notes = roundNotes(state, result);
  state.history.push(result);
  state.route = [];
  state.sharpenToday = false;
  state.day += 1;

  if (state.day > state.days || state.properties.every((p) => !p.active)) {
    state.phase = 'gameover';
  } else {
    state.today = rollDay(state);
    state.phase = 'forecast';
  }
  return state;
}

/**
 * What the round is telling you. The expectations and the fussiness are never
 * printed, so this is how you learn who wants what.
 */
export function roundNotes(state, result) {
  const notes = [];
  for (const job of result.jobs) {
    if (job.note !== 'No complaints.') notes.push(`${job.name}: ${job.note}`);
  }
  for (const gone of result.lost) {
    notes.push(`${gone.name} has cancelled. That is ${'$' + gone.rate.toFixed(2)} a visit gone.`);
  }
  const worst = result.neglected.sort((a, b) => b.overdueBy - a.overdueBy)[0];
  if (worst && !result.lost.length) {
    notes.push(`${worst.name} is ${worst.overdueBy} day${worst.overdueBy === 1 ? '' : 's'} past when they expected you.`);
  }
  if (result.skipped > 0) {
    notes.push(`You ran out of day with ${result.skipped} lawn${result.skipped === 1 ? '' : 's'} still on the list.`);
  }
  if (state.sharpness < 0.4) notes.push('The blade is tearing the grass rather than cutting it.');
  if (notes.length === 0) notes.push('A quiet day on the round.');
  return notes.slice(0, 5);
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

export function finalScore(state) {
  const net = round2(state.money - state.stake);
  const kept = state.properties.filter((p) => p.active).length;
  const visits = state.properties.reduce((n, p) => n + p.visits, 0);
  return {
    money: round2(state.money),
    net,
    visits,
    kept,
    started: state.properties.length - state.lost.length + state.lost.length,
    lost: state.lost.length,
    target: state.target,
    won: state.target == null ? null : net >= state.target,
    rank: rankFor(net, state.lost.length),
  };
}

function rankFor(net, lost) {
  if (lost === 0 && net >= 400) return { title: 'Full Book', icon: '👑' };
  if (net >= 400) return { title: 'Busy Season', icon: '🏆' };
  if (net >= 220) return { title: 'Steady Round', icon: '🌿' };
  if (net >= 90) return { title: 'Scraping By', icon: '🚐' };
  if (net > 0) return { title: 'Barely Worth It', icon: '😓' };
  return { title: 'Out Of Pocket', icon: '💸' };
}

/* ------------------------------------------------------------------ *
 * Reference play
 *
 * A bot used to set each neighbourhood's target ("par"). It plans each day
 * greedily — best value per minute, from wherever the van currently is —
 * across a family of weightings, and the best of them is what the target is
 * measured against. Because the search happens on the neighbourhood itself,
 * a sprawling round of fussy clients gets an honestly lower bar than a tight
 * one, without anyone balancing 625 numbers by hand.
 * ------------------------------------------------------------------ */

export const POLICIES = (() => {
  const out = [];
  // Two families, because they are genuinely different strategies: drive the
  // shortest loop, or chase the most valuable work. Plain nearest-neighbour
  // turned out to beat every value-weighted policy, so par has to contain it —
  // a target measured against a worse bot is not a target.
  for (const rescueAt of [0, 0.25, 0.45]) {
    for (const sharpenAt of [0.45, 0.75]) {
      for (const takeOffers of [true, false]) {
        out.push({ mode: 'nearest', rescueAt, sharpenAt, takeOffers, urgency: 0, rateWeight: 0 });
      }
    }
  }
  for (const urgency of [0, 25, 70]) {
    for (const rateWeight of [0.4, 1]) {
      for (const sharpenAt of [0.45, 0.75]) {
        for (const takeOffers of [true, false]) {
          out.push({ mode: 'value', urgency, rateWeight, sharpenAt, takeOffers, rescueAt: 0 });
        }
      }
    }
  }
  return out;
})();

/**
 * Plan a day from the depot.
 *
 * `nearest` walks the shortest loop it can, optionally detouring first to
 * anybody about to cancel. `value` chases the best return per minute. Both
 * stop as soon as the next job would not leave time to get home.
 */
export function referenceRoute(state, policy) {
  const mods = state.mods;
  let at = DEPOT;
  let spent = state.sharpenToday ? SHARPEN_MINUTES : 0;
  let sharpness = state.sharpenToday ? 1 : state.sharpness;
  const route = [];
  const taken = new Set();

  for (;;) {
    let best = null;
    for (const p of state.properties) {
      if (!p.active || taken.has(p.id) || !isDue(p)) continue;   // nothing to cut, nothing to bill

      const drive = travelMinutes(at, p, mods);
      const dullFactor = 1 + (1 - sharpness) * 0.35;
      const heightFactor = 1 + Math.max(0, p.height - IDEAL_HEIGHT) / 14;
      const mow = p.size * MINUTES_PER_SIZE * mods.slope * heightFactor *
        (state.today.wet ? 1.25 : 1) * dullFactor;
      const home = travelMinutes(p, DEPOT, mods);
      if (spent + drive + mow + home > state.today.workable) continue;

      let score;
      if (policy.mode === 'nearest') {
        // Shortest hop, but somebody on the brink jumps the queue.
        const rescuing = p.patience <= policy.rescueAt;
        score = (rescuing ? 1e6 : 0) - drive;
      } else {
        const overdueBy = Math.max(0, daysSinceCut(p, state.day) - p.expectedGap);
        const risk = (1 - p.patience) * policy.urgency + overdueBy * 6;
        score = (1 + p.rate * policy.rateWeight + risk) / Math.max(1, drive + mow);
      }
      if (!best || score > best.score) best = { id: p.id, score, drive, mow, p };
    }
    if (!best) break;
    route.push(best.id);
    taken.add(best.id);
    spent += best.drive + best.mow;
    sharpness = clamp(sharpness - best.p.size * 0.012 * mods.dulling, 0.15, 1);
    at = best.p;
  }
  return route;
}

/** Play a whole run under one policy and report the profit it cleared. */
export function playPolicy(config, policy) {
  const state = newRun({ ...config, target: null });
  while (state.phase !== 'gameover') {
    if (state.today.offer && policy.takeOffers) acceptOffer(state);
    state.sharpenToday = state.sharpness < policy.sharpenAt;
    state.route = referenceRoute(state, policy);
    commitDay(state, simulateDay(state));
  }
  return round2(state.money - state.stake);
}

/**
 * Profit the best policy in the family clears on this neighbourhood.
 * This is what targets are measured against.
 */
export function parProfit(config) {
  let best = -Infinity;
  for (const policy of POLICIES) {
    const profit = playPolicy(config, policy);
    if (profit > best) best = profit;
  }
  return best;
}
