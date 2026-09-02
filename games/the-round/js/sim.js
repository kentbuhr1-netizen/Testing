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
/**
 * Taking your time over a lawn: what it costs and what it buys.
 *
 * The blade is a lever you pull once for the whole day. This is the one you
 * pull per client, and it is the only reason knowing a client's standard is
 * worth anything — without it a discovered standard is a fact you cannot act
 * on. It costs minutes, which is the game's scarce resource, so the answer is
 * never "always".
 */
export const CARE_TIME = 1.3;      // 30% longer on that lawn
export const CARE_QUALITY = 0.20;  // and it shows in the finish

/**
 * Word gets round.
 *
 * A round holds more lawns than there is daylight to cut, so on its own a
 * cancellation costs nothing — you simply mow somebody else instead, and every
 * hidden thing about a client stops mattering. What a lost contract really
 * costs a one-van business is its name, and a name is worth money on every
 * lawn. This is the number that makes keeping people happy worth the minutes.
 */
export const STANDING_LOST = 0.09;    // per client who walks
export const STANDING_PLEASED = 0.004; // per finish that beat what they wanted
export const STANDING_FLOOR = 0.55;
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

/**
 * The daylight an average day on this round is worth, before anyone plans it.
 *
 * The same weights `pickWeather` rolls against, resolved rather than sampled,
 * so anything wanting a typical day — the firm's outlook, for one — takes it
 * from the weather table itself instead of keeping a second copy of it.
 */
export function expectedWorkable(mods) {
  const m = withMods(mods);
  const weights = [
    [WEATHER.clear, 0.30],
    [WEATHER.overcast, 0.26],
    [WEATHER.heat, 0.1],
    [WEATHER.showers, 0.22 * m.wetBias],
    [WEATHER.storm, 0.12 * m.wetBias],
  ];
  const total = weights.reduce((n, [, w]) => n + w, 0);
  return WORK_MINUTES * weights.reduce((n, [w, weight]) => n + w.workable * weight, 0) / total;
}

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

/**
 * How long this lawn takes today, given its state and yours.
 *
 * Every path that costs a day out — the planner, the simulator and the
 * reference routers — goes through here. They used to each carry their own
 * copy of this arithmetic, which meant the route you were shown could quietly
 * disagree with the day you worked.
 *
 * `state` needs only `mods`, `today.wet` and `sharpness`, so a caller walking
 * a route can pass its own running sharpness rather than the state's.
 */
export function mowMinutes(property, state, care = false) {
  const mods = state.mods;
  const heightFactor = 1 + Math.max(0, property.height - IDEAL_HEIGHT) / 14;
  const wetFactor = state.today.wet ? 1.25 : 1;
  const dullFactor = 1 + (1 - state.sharpness) * 0.35;
  return property.size * MINUTES_PER_SIZE * mods.slope * heightFactor * wetFactor * dullFactor
    * (care ? CARE_TIME : 1);
}

/** How good the cut is, 0..1. Blunt blades and wet, overgrown grass all show. */
export function cutQuality(property, state, care = false) {
  const overgrown = Math.max(0, property.height - IDEAL_HEIGHT) / 22;
  return clamp(
    0.52 + 0.26 * state.sharpness - (state.today.wet ? 0.12 : 0) - Math.min(0.3, overgrown)
      + (care ? CARE_QUALITY : 0),
    0, 1
  );
}

/** The van, mid-round: enough of a state for mowMinutes and cutQuality. */
const atSharpness = (state, sharpness) => ({ mods: state.mods, today: state.today, sharpness });

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
    standing: 1,          // what the round says about you, 0.55..1

    route: [],
    care: [],            // stops you have decided to take your time over
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
  const care = new Set(state.care || []);
  let at = DEPOT;
  let spent = state.sharpenToday ? SHARPEN_MINUTES : 0;
  let sharpness = state.sharpenToday ? 1 : state.sharpness;
  const legs = [];

  for (const id of route) {
    const p = state.properties[id];
    if (!p || !p.active) continue;
    const drive = travelMinutes(at, p, mods);
    const careful = care.has(id);
    const mow = mowMinutes(p, atSharpness(state, sharpness), careful);
    const home = travelMinutes(p, DEPOT, mods);

    // The van has to get back, so a job only fits if the return leg fits too.
    const fits = spent + drive + mow + home <= state.today.workable;
    legs.push({ id, drive, mow, fits, careful, sharpnessAt: sharpness });
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
  let standing = state.standing ?? 1;
  let pleased = 0;
  if (state.sharpenToday) money = round2(money - SHARPEN_COST);

  const jobs = [];
  const care = new Set(state.care || []);
  const properties = state.properties.map((p) => ({ ...p, complaints: [...p.complaints] }));

  // --- the lawns you got to
  for (const id of plan.doable) {
    const p = properties[id];
    const due = isDue(p);
    const careful = care.has(id);
    const van = atSharpness({ ...state, mods }, sharpness);
    const quality = cutQuality(p, van, careful);
    // What the finish would have been in and out at the usual pace. The
    // difference is what tells the player whether the extra time bought
    // anything on this particular lawn.
    const hurried = cutQuality(p, van, false);
    const overdueBy = Math.max(0, daysSinceCut(p, state.day) - p.expectedGap);
    const bar = qualityBar(p);
    const paid = due ? round2(p.rate * standing) : 0;

    money = round2(money + paid);
    // People forgive a good cut and remember a bad one, so the downside is
    // far steeper than the upside. This is what makes a blunt blade cost
    // contracts rather than just minutes.
    const gap = quality - bar;
    const delta = due
      ? clamp(
          (gap >= 0 ? 0.12 * gap : 1.8 * gap) -
            0.055 * (overdueBy / Math.max(1, p.expectedGap)) * p.fussiness,
          // Wide enough that a badly missed standard still reads worse than a
          // narrowly missed one — a floor that saturates makes every poor
          // finish identical, and there is then nothing to learn.
          -0.5, 0.12
        )
      : -0.03;   // turning up to cut nothing wears on people
    p.patience = clamp(p.patience + delta, 0, 1);
    p.lastCut = state.day;
    p.height = 1.2;
    if (due) p.visits += 1;
    if (due && gap > 0) pleased += 1;
    sharpness = clamp(sharpness - p.size * 0.012 * mods.dulling, 0.15, 1);

    jobs.push({ id, name: p.name, rate: paid, due, quality, overdueBy, delta, careful,
      note: due ? jobNote(quality, bar, overdueBy, state.today.wet,
                          { careful, wasted: careful && hurried >= bar })
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

  // --- what the round now says about you
  standing = clamp(
    standing - STANDING_LOST * lost.length + STANDING_PLEASED * pleased,
    STANDING_FLOOR, 1
  );

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
    standing: round2(standing),
    standingWas: round2(state.standing ?? 1),
    next: { properties, money, sharpness, standing },
  };
}

/**
 * What they said. This is the whole of the player's information about a
 * client's standard, so it has to cut both ways: a note when the finish fell
 * short of what they wanted, and a note when you spent the extra time on
 * somebody who was never going to notice.
 */
function jobNote(quality, bar, overdueBy, wet, { careful = false, wasted = false } = {}) {
  if (overdueBy >= 5) return 'It was a hayfield by the time you came.';
  if (overdueBy >= 2) return 'It was getting a bit shaggy.';
  if (quality < bar - 0.15) return 'They looked at the finish and said nothing, twice.';
  if (quality < bar) return 'Looks like you were in a hurry.';
  if (wasted) return 'They would not have known either way. You could have been in and out.';
  if (careful) return 'They noticed you took your time over it.';
  if (wet && quality >= bar) return 'Good job, considering the wet.';
  if (quality > bar + 0.15) return 'They came out to say it looks a picture.';
  return 'No complaints.';
}

/** Apply a worked day and move the calendar forward. */
export function commitDay(state, result) {
  state.properties = result.next.properties;
  state.money = result.next.money;
  state.sharpness = result.next.sharpness;
  state.standing = result.next.standing;
  state.lost.push(...result.lost);

  result.notes = roundNotes(state, result);
  state.history.push(result);
  state.route = [];
  state.care = [];
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
    standing: round2(state.standing ?? 1),
    started: state.properties.length,
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
 * A family of bots used to set each neighbourhood's target ("par"). Each one
 * plays that exact round and the best of them is what the target is measured
 * against. Because the search happens on the neighbourhood itself, a sprawling
 * round of fussy clients gets an honestly lower bar than a tight one, without
 * anyone balancing 625 numbers by hand.
 *
 * Three routers, crossed with three ways of deciding where the extra time
 * goes. `nearest` drives the shortest hop it can see; `value` chases the best
 * return per minute; `loop` fills the day like `nearest`, untangles the
 * result, and spends whatever that freed. `value` is kept because a model
 * change could make it the right answer again, not because it wins today.
 * ------------------------------------------------------------------ */

export const POLICIES = (() => {
  const out = [];
  // Four ways of deciding where the extra time goes, because that decision is
  // the point of the lever: never; on a finish that is visibly heading for
  // trouble; and two that know what each client will accept, differing in how
  // far short things have to be before the minutes are worth it. The gap
  // between those and `visible` is what the hidden standard is worth.
  const care = [
    { careMode: 'never', careMargin: 0 },
    { careMode: 'visible', careMargin: 0 },
    { careMode: 'standard', careMargin: 0.05 },
    { careMode: 'standard', careMargin: 0.15 },
  ];
  const sharpen = [0.45, 0.75];

  for (const mode of ['loop', 'nearest', 'value']) {
    for (const c of care) {
      for (const sharpenAt of sharpen) {
        out.push({
          mode, ...c, sharpenAt, takeOffers: true, rescueAt: 0,
          urgency: mode === 'value' ? 25 : 0,
          rateWeight: mode === 'value' ? 1 : 0,
        });
      }
    }
  }
  // Two axes that are measurably never the answer, kept live in the family so
  // that a change to the model can say otherwise: turning work down, and
  // detouring to somebody on the brink.
  const keen = { careMode: 'standard', careMargin: 0.15, sharpenAt: 0.75, urgency: 0, rateWeight: 0 };
  out.push({ mode: 'loop', ...keen, takeOffers: false, rescueAt: 0 });
  out.push({ mode: 'loop', ...keen, takeOffers: true, rescueAt: 0.15 });
  return out;
})();

/** A finish this poor is heading for a complaint from anybody averagely fussy. */
const VISIBLY_POOR = 0.8;

/**
 * Should this stop get the extra time?
 *
 * `visible` uses only what is on the screen — a wet day, a blunt blade, grass
 * that got away from you. The others also know what this client will accept,
 * which is the thing the player has to infer.
 *
 * They differ in how far short the finish has to be heading before the minutes
 * are worth spending. Missing a standard by a hair costs almost no patience,
 * so lingering over it is a lawn you do not get to; the margin is what stops
 * the bot buying insurance it does not need. Measured over 52 rounds, a margin
 * of 0.15 is worth 6% more than taking the time whenever the finish would fall
 * short at all.
 */
function wantsCare(p, van, policy) {
  switch (policy.careMode) {
    case 'always': return true;
    case 'visible': return cutQuality(p, van, false) < VISIBLY_POOR;
    case 'standard': return qualityBar(p) - cutQuality(p, van, false) > policy.careMargin;
    default: return false;
  }
}

/**
 * Walk a route exactly as planRoute would and return the minutes it needs,
 * return leg included. The order matters beyond the driving: the blade goes
 * off as you go, so a lawn late in the day costs more than the same lawn
 * early.
 */
function routeMinutes(state, order, care) {
  const mods = state.mods;
  let at = DEPOT;
  let spent = state.sharpenToday ? SHARPEN_MINUTES : 0;
  let sharpness = state.sharpenToday ? 1 : state.sharpness;
  for (const id of order) {
    const p = state.properties[id];
    spent += travelMinutes(at, p, mods) + mowMinutes(p, atSharpness(state, sharpness), care.has(id));
    sharpness = clamp(sharpness - p.size * 0.012 * mods.dulling, 0.15, 1);
    at = p;
  }
  return spent + travelMinutes(at, DEPOT, mods);
}

/** Greedily fill the day, one stop at a time, from wherever the van is. */
function greedyRoute(state, policy) {
  const mods = state.mods;
  let at = DEPOT;
  let spent = state.sharpenToday ? SHARPEN_MINUTES : 0;
  let sharpness = state.sharpenToday ? 1 : state.sharpness;
  const route = [];
  const care = new Set();
  const taken = new Set();

  for (;;) {
    let best = null;
    for (const p of state.properties) {
      if (!p.active || taken.has(p.id) || !isDue(p)) continue;   // nothing to cut, nothing to bill

      const van = atSharpness(state, sharpness);
      const drive = travelMinutes(at, p, mods);
      const careful = wantsCare(p, van, policy);
      const mow = mowMinutes(p, van, careful);
      const home = travelMinutes(p, DEPOT, mods);
      if (spent + drive + mow + home > state.today.workable) continue;

      let score;
      if (policy.mode === 'value') {
        const overdueBy = Math.max(0, daysSinceCut(p, state.day) - p.expectedGap);
        const risk = (1 - p.patience) * policy.urgency + overdueBy * 6;
        score = (1 + p.rate * policy.rateWeight + risk) / Math.max(1, drive + mow);
      } else {
        // Shortest hop, but somebody on the brink jumps the queue.
        score = (p.patience <= policy.rescueAt ? 1e6 : 0) - drive;
      }
      if (!best || score > best.score) best = { id: p.id, score, drive, mow, careful, p };
    }
    if (!best) break;
    route.push(best.id);
    taken.add(best.id);
    if (best.careful) care.add(best.id);
    spent += best.drive + best.mow;
    sharpness = clamp(sharpness - best.p.size * 0.012 * mods.dulling, 0.15, 1);
    at = best.p;
  }
  return { route, care };
}

/**
 * Untangle the loop.
 *
 * Plain 2-opt on driving distance: repeatedly reverse a stretch of the route
 * if doing so crosses fewer of its own tracks. Distance rather than minutes,
 * because mowing barely depends on the order and this keeps the pass cheap
 * enough to run 625 times in a test.
 */
function twoOpt(state, order) {
  if (order.length < 4) return order;
  const at = (i) => (i < 0 || i >= order.length ? DEPOT : state.properties[order[i]]);
  let best = order.slice();
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const a = at(i - 1), b = at(i), c = at(k), d = at(k + 1);
        const delta = distance(a, c) + distance(b, d) - distance(a, b) - distance(c, d);
        if (delta < -1e-9) {
          best = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

/**
 * Spend the time the untangling freed up.
 *
 * Cheapest insertion, best return per added minute first, stopping as soon as
 * nothing else will fit before dark.
 */
function topUp(state, order, care, policy) {
  const mods = state.mods;
  let route = order;
  for (;;) {
    let best = null;
    for (const p of state.properties) {
      if (!p.active || route.includes(p.id) || !isDue(p)) continue;
      const careful = wantsCare(p, atSharpness(state, state.sharpenToday ? 1 : state.sharpness), policy);
      for (let i = 0; i <= route.length; i++) {
        const candidate = [...route.slice(0, i), p.id, ...route.slice(i)];
        const nextCare = careful ? new Set([...care, p.id]) : care;
        const minutes = routeMinutes(state, candidate, nextCare);
        if (minutes > state.today.workable) continue;
        const value = p.rate / Math.max(1, minutes);
        if (!best || value > best.value) best = { value, candidate, careful, id: p.id };
      }
    }
    if (!best) break;
    route = best.candidate;
    if (best.careful) care.add(best.id);
  }
  return route;
}

/**
 * Plan a day from the depot: which lawns, in what order, and which of them
 * get the extra time.
 *
 * `nearest` and `value` fill the day greedily and stop. `loop` does the same,
 * then untangles the result and spends whatever that freed. All three stop as
 * soon as the next job would not leave time to get home.
 */
export function referencePlan(state, policy) {
  const { route, care } = greedyRoute(state, policy);
  if (policy.mode !== 'loop' || route.length < 4) return { route, care };

  const untangled = twoOpt(state, route);
  // Only keep the untangling if it really is quicker end to end — the blade
  // going off as the day wears on can undo a shorter drive.
  const best = routeMinutes(state, untangled, care) < routeMinutes(state, route, care)
    ? untangled : route;
  return { route: topUp(state, best, care, policy), care };
}

/** Just the order, for callers that do not care about the extra time. */
export function referenceRoute(state, policy) {
  return referencePlan(state, policy).route;
}

/** Play a whole run under one policy and report the profit it cleared. */
export function playPolicy(config, policy) {
  const state = newRun({ ...config, target: null });
  while (state.phase !== 'gameover') {
    if (state.today.offer && policy.takeOffers) acceptOffer(state);
    state.sharpenToday = state.sharpness < policy.sharpenAt;
    const plan = referencePlan(state, policy);
    state.route = plan.route;
    state.care = [...plan.care].filter((id) => plan.route.includes(id));
    commitDay(state, simulateDay(state));
  }
  return round2(state.money - state.stake);
}

/* ------------------------------------------------------------------ *
 * Plain play
 *
 * Par is the ceiling, and on its own it is a poor yardstick: the gap between
 * par and a person is not the same on every round. Two rounds with identical
 * par cleared at wildly different rates in simulated play — 100% on one, 11%
 * on the next — because what makes a round awkward for somebody who is not
 * paying full attention is not what makes it awkward for a router.
 *
 * Anchoring on a second bot does not fix it: a tidy reference player lands at
 * 86-100% of par and moves with par rather than against it. What does fix it
 * is measuring the round against a spread of *imperfect* attempts and asking
 * the player to beat a share of them. Whatever it is that makes a round hard
 * then shows up in the spread, without anyone having to name it.
 *
 * Seeded from the round, so the bar is the same every time it is drawn.
 * ------------------------------------------------------------------ */

/** How many imperfect seasons a round is measured against. */
export const PLAIN_SAMPLES = 24;

/**
 * One plausible way of not playing very well.
 *
 * The range has to span how badly a person can actually play, not a tidy
 * approximation of it. A first version left out the two commonest habits —
 * knocking off with half the day left, and lingering over every lawn on the
 * round — and set a bar that 54 of 100 simulated players could not clear once.
 */
function plainTraits(rng) {
  return {
    fill: 0.5 + rng() * 0.55,        // how much of the day they bother to use
    sharpens: rng() < 0.45,
    // Most people act on being told off; some linger over everybody, which
    // costs them the day; some never touch it.
    care: rng() < 0.62 ? 'told' : (rng() < 0.5 ? 'everyone' : 'never'),
    remembers: 0.5 + rng() * 0.45,
    takesOffers: rng() < 0.85,
    // How often they take whoever is closest to cancelling rather than
    // whoever is closest. The round list on screen is sorted by exactly that,
    // so following it is the path of least resistance and most people do.
    wander: 0.2 + rng() * 0.5,
  };
}

/** A day's round as somebody distracted would plan it. */
function plainRoute(state, traits, told, rng) {
  const mods = state.mods;
  const budget = state.today.workable * traits.fill;
  const route = [];
  const care = [];
  let spent = state.sharpenToday ? SHARPEN_MINUTES : 0;
  let sharpness = state.sharpenToday ? 1 : state.sharpness;
  let at = DEPOT;

  for (;;) {
    const open = state.properties.filter(
      (p) => p.active && isDue(p) && !route.includes(p.id));
    if (!open.length) break;
    // Nearest to hand, mostly — with a fair chance of just taking whoever is
    // nearest to walking, which is who the list puts at the top.
    open.sort((a, b) => travelMinutes(at, a, mods) - travelMinutes(at, b, mods));
    const byRisk = open.slice().sort((a, b) => a.patience - b.patience);
    const p = rng() < traits.wander ? byRisk[0] : open[0];

    const careful = traits.care === 'everyone'
      || (traits.care === 'told' && told.has(p.id) && rng() < traits.remembers);
    const van = atSharpness(state, sharpness);
    const drive = travelMinutes(at, p, mods);
    const mow = mowMinutes(p, van, careful);
    if (spent + drive + mow + travelMinutes(p, DEPOT, mods) > state.today.workable) break;
    if (spent + drive + mow > budget) break;   // they call it a day early

    route.push(p.id);
    if (careful) care.push(p.id);
    spent += drive + mow;
    sharpness = clamp(sharpness - p.size * 0.012 * mods.dulling, 0.15, 1);
    at = p;
  }
  return { route, care };
}

/** Play one imperfect season end to end. */
function plainSeason(config, seed) {
  const rng = mulberry32(seed);
  const traits = plainTraits(rng);
  const state = newRun({ ...config, target: null });
  const told = new Set();   // clients who have complained about the finish

  while (state.phase !== 'gameover') {
    if (state.today.offer && traits.takesOffers) acceptOffer(state);
    state.sharpenToday = traits.sharpens && state.sharpness < 0.45 && rng() < 0.7;
    const plan = plainRoute(state, traits, told, rng);
    state.route = plan.route;
    state.care = plan.care;
    const result = simulateDay(state);
    // The only thing they learn from, and only about clients named at them.
    for (const job of result.jobs) {
      if (/hurry|said nothing/.test(job.note)) told.add(job.id);
      if (/in and out/.test(job.note)) told.delete(job.id);
    }
    commitDay(state, result);
  }
  return round2(state.money - state.stake);
}

/**
 * What imperfect play makes of this round, worst to best.
 *
 * Ask for the 40th of these and roughly 60% of plain attempts clear it; ask
 * for the 90th and almost none do. That is a bar that means the same thing on
 * every round in the game.
 */
export function plainSpread(config, samples = PLAIN_SAMPLES) {
  const out = [];
  for (let i = 0; i < samples; i++) {
    out.push(plainSeason(config, ((config.seed ?? 1) + i * 2654435761) >>> 0));
  }
  return out.sort((a, b) => a - b);
}

/** The profit that beats `share` of imperfect attempts at this round. */
export function plainPercentile(spread, share) {
  const at = clamp(share, 0, 1) * (spread.length - 1);
  const lo = Math.floor(at);
  const hi = Math.min(spread.length - 1, lo + 1);
  return spread[lo] + (spread[hi] - spread[lo]) * (at - lo);
}

/**
 * Profit the best policy in the family clears on this neighbourhood.
 * This is the ceiling a target is measured against.
 */
export function parProfit(config) {
  let best = -Infinity;
  for (const policy of POLICIES) {
    const profit = playPolicy(config, policy);
    if (profit > best) best = profit;
  }
  return best;
}
