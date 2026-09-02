/**
 * Outbreak — week simulation.
 *
 * A "run" is one outbreak in one district: a pathogen, a population, a weekly
 * budget, and a number of lives you have to save to hold the district.
 *
 * The week is the turn, but the disease is simulated a day at a time inside
 * it, so real day-scale incubation and infectious periods produce sensible
 * curves. You set four levers once a week and watch seven days play out.
 *
 * The four levers fight each other. Distancing is the only one that costs no
 * money — it costs you the tax base that pays for the other three, and the
 * public's patience, which is the only thing that makes it work at all.
 *
 * Everything here is pure: give it a state object and it gives numbers back.
 * No DOM, no storage. campaign.js decides which runs exist; app.js draws them.
 */

export const DAYS_PER_WEEK = 7;
export const START_COMPLIANCE = 0.82;
export const REF_POP = 200_000;        // costs below are quoted at this size
export const BASE_POP = 200_000;
export const BASE_TEST_RATE = 0.02;    // people testable per week, per head
export const BASE_BED_RATE = 0.0013;   // beds per head before you build any
export const BED_PER_LEVEL = 0.00045;  // beds per head, per level, per week
export const VAX_PER_LEVEL = 0.008;    // share of the population dosed per level

/** Deterministic PRNG so a week can be replayed (and unit tested). */
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

/** Weekly cost of one level of each lever, in $M at REF_POP. */
export const LEVER_COST = {
  trace: 0.85,
  distance: 0,     // free in money, ruinous in everything else
  vaccine: 1.3,
  beds: 1.05,
};

/**
 * Staffing a ward you opened, as a share of what it cost to open it.
 *
 * Without this, funding beds is a one-off purchase of a permanent asset: the
 * stock grows linearly for a flat weekly price, and buying beds from week one
 * dominates every other lever by a wide margin. Upkeep is what gives the
 * hospital an opportunity cost, so beds become a question of *when* rather
 * than a free win.
 */
export const BED_UPKEEP_SHARE = 0.28;
/** What one bed costs to open, in $M — the bed lever's price per bed. */
export const BED_BUILD_COST_PER_BED = LEVER_COST.beds / (BED_PER_LEVEL * REF_POP);
/** What one open bed costs to staff each week thereafter, in $M. */
export const BED_UPKEEP_PER_BED = BED_BUILD_COST_PER_BED * BED_UPKEEP_SHARE;

/** Weekly bill for the wards already standing. Never scaled: a bed is a bed. */
export function bedUpkeep(builtBeds) {
  return Math.round(builtBeds * BED_UPKEEP_PER_BED * 100) / 100;
}

export const LEVERS = [
  { id: 'trace', label: 'Test & trace', icon: '🔬',
    blurb: 'Find cases and chase their contacts. Only as good as the labs can keep up with.' },
  { id: 'distance', label: 'Distancing', icon: '🚧',
    blurb: 'Close things. Costs no budget — it costs the tax base and the public’s patience.' },
  { id: 'vaccine', label: 'Vaccination', icon: '💉',
    blurb: 'Slow to bite and useless late, but the only lever that compounds.' },
  { id: 'beds', label: 'Hospital beds', icon: '🏥',
    blurb: 'Does nothing to the spread. Decides who survives it. Beds open a week after funding.' },
];

export const NO_LEVELS = { trace: 0, distance: 0, vaccine: 0, beds: 0 };

/**
 * Weekly bill for a set of levels, scaled to the district's size, plus the
 * upkeep on wards already open. Opening a bed is charged once, in the week you
 * fund it; staffing it is charged every week after.
 */
export function weeklySpend(levels, pop, builtBeds = 0) {
  const scale = pop / REF_POP;
  return round2(
    (levels.trace * LEVER_COST.trace +
     levels.vaccine * LEVER_COST.vaccine +
     levels.beds * LEVER_COST.beds) * scale
    + builtBeds * BED_UPKEEP_PER_BED
  );
}

/**
 * Trim a set of levels down to what `funds` can actually pay for.
 *
 * Closing things cuts the tax base, so a programme that was affordable last
 * week can quietly stop being affordable this week. Rather than dead-end the
 * player on a disabled button, the dearest levers are given up first.
 * Distancing costs nothing and is never trimmed.
 */
export function affordLevels(levels, funds, pop, builtBeds = 0) {
  const out = { ...levels };
  for (const key of ['vaccine', 'beds', 'trace']) {   // dearest first
    while (out[key] > 0 && weeklySpend(out, pop, builtBeds) > funds) out[key] -= 1;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Modifiers — every knob a district, region or tier can turn
 * ------------------------------------------------------------------ */

export const NO_MODS = {
  density: 1,          // multiplies transmission
  trust: 1,            // how far the public will actually go along
  fatigue: 1,          // how fast patience drains under distancing
  ageing: 1,           // multiplies the death rate
  labs: 1,             // baseline testing throughput
  bedsBase: 1,         // hospital beds you start with
  funding: 1,          // weekly budget
  economy: 1,          // how hard distancing bites the budget
  imports: 0,          // infections arriving from outside, per week
  vaccineDelay: 0,     // extra weeks before doses take
  seasonality: 0,      // amplitude of a seasonal swing in transmission
  popScale: 1,         // district size
};

export function withMods(mods) {
  return { ...NO_MODS, ...(mods || {}) };
}

/* ------------------------------------------------------------------ *
 * Pathogens
 *
 * `traceability` and `contactSensitivity` are the two hidden numbers the
 * whole game turns on, and neither is ever printed. You infer them from the
 * weekly surveillance notes, the way you infer a recipe from a grumble.
 * Periods are in days.
 * ------------------------------------------------------------------ */

export const PATHOGENS = [
  { id: 'marrow', name: 'Marrow Flu', icon: '🤧',
    blurb: 'A fast, ordinary respiratory flu. Everything works on it — if you are quick.',
    r0: [2.1, 2.8], incubation: [1.5, 2.5], infectious: [3.5, 5.0],
    ifr: [0.004, 0.007], hosp: [0.035, 0.055],
    traceability: 0.9, contactSensitivity: 1.0, vaccineLag: 2, waning: 0 },
  { id: 'quietcarrier', name: 'Quiet Carrier', icon: '🫥',
    blurb: 'Spreads for days before anyone feels ill. By the time a test comes back it is old news.',
    r0: [2.4, 3.2], incubation: [3.0, 4.5], infectious: [6.0, 9.0],
    ifr: [0.006, 0.011], hosp: [0.05, 0.08],
    traceability: 0.3, contactSensitivity: 0.95, vaccineLag: 2, waning: 0 },
  { id: 'greylung', name: 'Grey Lung', icon: '🫁',
    blurb: 'Slow, and it fills wards. Most of the dying is done by the hospital running out of room.',
    r0: [1.8, 2.4], incubation: [4.0, 6.0], infectious: [7.0, 11.0],
    ifr: [0.012, 0.022], hosp: [0.14, 0.2],
    traceability: 0.75, contactSensitivity: 0.9, vaccineLag: 3, waning: 0 },
  { id: 'ashfall', name: 'Ashfall', icon: '🌫️',
    blurb: 'Explosive and mild. It will reach everyone; the only question is how fast.',
    r0: [4.0, 5.4], incubation: [1.0, 2.0], infectious: [3.0, 4.5],
    ifr: [0.002, 0.004], hosp: [0.02, 0.035],
    traceability: 0.55, contactSensitivity: 1.05, vaccineLag: 2, waning: 0 },
  { id: 'vector', name: 'Culex Fever', icon: '🦟',
    blurb: 'Carried by mosquitoes, not by people. Shutting the cafés does nothing at all.',
    r0: [2.2, 3.0], incubation: [4.0, 6.0], infectious: [7.0, 10.0],
    ifr: [0.008, 0.014], hosp: [0.07, 0.11],
    traceability: 0.45, contactSensitivity: 0.2, vaccineLag: 3, waning: 0 },
  { id: 'reprise', name: 'Reprise', icon: '🔁',
    blurb: 'Immunity fades within weeks. There is no waiting this one out.',
    r0: [2.0, 2.7], incubation: [2.5, 4.0], infectious: [5.0, 7.0],
    ifr: [0.005, 0.009], hosp: [0.045, 0.07],
    traceability: 0.7, contactSensitivity: 0.9, vaccineLag: 2, waning: 0.06 },
  { id: 'cascade', name: 'Cascade', icon: '☠️',
    blurb: 'Slow to spread and appalling to catch. Every single case you miss is a life.',
    r0: [1.5, 2.0], incubation: [5.0, 7.0], infectious: [8.0, 12.0],
    ifr: [0.035, 0.06], hosp: [0.18, 0.26],
    traceability: 0.8, contactSensitivity: 0.85, vaccineLag: 4, waning: 0 },
  { id: 'hollow', name: 'Hollow Cough', icon: '🌬️',
    blurb: 'Airborne and patient. Distancing bites hard, but the vaccine takes an age to arrive.',
    r0: [2.8, 3.6], incubation: [3.0, 4.5], infectious: [5.5, 8.0],
    ifr: [0.007, 0.013], hosp: [0.06, 0.095],
    traceability: 0.6, contactSensitivity: 1.15, vaccineLag: 5, waning: 0.02 },
];

export const PATHOGEN_INDEX = Object.fromEntries(PATHOGENS.map((p) => [p.id, p]));

/** Resolve an archetype into the exact pathogen this district is facing. */
export function rollPathogen(seed, archetypeId = null) {
  const rng = mulberry32((seed ^ 0x5f3759df) >>> 0);
  const arch = archetypeId
    ? PATHOGEN_INDEX[archetypeId]
    : PATHOGENS[Math.floor(rng() * PATHOGENS.length)];
  const span = ([lo, hi]) => lo + rng() * (hi - lo);
  const r0 = span(arch.r0);
  const incubation = span(arch.incubation);
  const infectious = span(arch.infectious);
  return {
    id: arch.id,
    name: arch.name,
    icon: arch.icon,
    blurb: arch.blurb,
    r0: Math.round(r0 * 100) / 100,
    incubation,                       // days in the latent phase
    infectious,                       // days spent infectious
    beta: r0 / infectious,            // per-day contact rate
    generation: incubation + infectious,
    ifr: span(arch.ifr),
    hosp: span(arch.hosp),
    traceability: arch.traceability,
    contactSensitivity: arch.contactSensitivity,
    vaccineLag: arch.vaccineLag,
    waning: arch.waning,
  };
}

/**
 * How far along the outbreak already is when you are called in.
 *
 * Measured, not chosen: a pathogen that doubles every three days is caught
 * at a handful of cases, while something with a sixteen-day generation time
 * has necessarily been circulating unnoticed for months. Seeding from the
 * growth factor means every pathogen produces a real epidemic inside its own
 * run length, so no archetype is quietly harmless.
 */
export function seedInfections(pathogen, pop, weeks) {
  const growth = Math.pow(pathogen.r0, (weeks * DAYS_PER_WEEK) / pathogen.generation);
  const wanted = (pop * 0.5) / Math.max(1, growth);
  return clamp(wanted, 25, pop * 0.04);
}

/* ------------------------------------------------------------------ *
 * Starting a run
 * ------------------------------------------------------------------ */

/** The bare state, with no baseline attached so `baselineDeaths` cannot recurse. */
function rawRun({ seed, weeks = 12, funds = 11, baseFunds = 7, mods = null, pathogenId = null, district = null }) {
  const m = withMods(mods);
  const pop = Math.round(BASE_POP * m.popScale);
  const scale = pop / REF_POP;
  const pathogen = rollPathogen(seed, pathogenId);
  const i0 = seedInfections(pathogen, pop, weeks);
  const e0 = i0 * (pathogen.incubation / pathogen.infectious);

  return {
    seed, week: 1, weeks, target: null, district,
    mods: m,
    pathogen,
    pop,
    // Compartments, carried as floats and only rounded for display.
    s: pop - i0 - e0,
    e: e0,
    i: i0,
    r: 0,
    d: 0,
    funds: round2(funds * scale),
    baseFunds: round2(baseFunds * scale),
    labCapacity: pop * BASE_TEST_RATE * m.labs,
    bedCapacity: pop * BASE_BED_RATE * m.bedsBase,
    builtBeds: 0,          // wards you opened, and therefore have to staff
    bedQueue: 0,
    vaxQueue: [],          // [{ week, doses }] — doses that mature later
    levels: { ...NO_LEVELS },
    lastDeaths: 0,
    compliance: START_COMPLIANCE,
    history: [],
    phase: 'briefing',
    baselineDeaths: Infinity,
  };
}

export function newRun(config = {}) {
  const state = rawRun(config);
  state.target = config.target ?? null;
  state.baselineByWeek = baselineTrajectory(config);
  state.baselineDeaths = state.baselineByWeek[state.baselineByWeek.length - 1] ?? 0;
  return state;
}

/** Lives saved so far, against where a do-nothing response would be by now. */
export function savedSoFar(state) {
  if (!state.baselineByWeek) return livesSaved(state);
  const at = Math.min(state.week - 1, state.baselineByWeek.length) - 1;
  const reference = at >= 0 ? state.baselineByWeek[at] : 0;
  return Math.max(0, reference - state.d);
}

/* ------------------------------------------------------------------ *
 * The week
 * ------------------------------------------------------------------ */

/** How far test-and-trace actually reaches, 0..1. Swamped labs reach nobody. */
export function traceReach(state, level) {
  const capacity = state.labCapacity * (1 + 0.55 * level);
  const chasing = Math.max(1, (state.i + state.e) * 6); // ~6 contacts per case
  return clamp(capacity / chasing, 0, 1);
}

/** Share of transmission removed by testing this week. */
export function traceCut(state, level) {
  return 0.075 * level * traceReach(state, level) * state.pathogen.traceability;
}

/** Share of transmission removed by distancing this week. */
export function distanceCut(state, level) {
  return clamp(
    0.105 * level * state.compliance * state.pathogen.contactSensitivity * state.mods.trust,
    0, 0.82
  );
}

/** Seasonal swing in transmission over the length of the outbreak. */
export function seasonFactor(state) {
  if (!state.mods.seasonality) return 1;
  return 1 + state.mods.seasonality * Math.sin((state.week / state.weeks) * Math.PI * 2);
}

/** What fraction of the budget the economy still delivers under distancing. */
export function economyFactor(state, level) {
  return clamp(1 - 0.15 * level * state.mods.economy, 0.25, 1);
}

/**
 * Run the week, a day at a time. Pure: reads the state and the levels already
 * set on it and returns a report, including the compartments it ends on.
 * `commitWeek` is what writes any of it back.
 */
export function simulateWeek(state) {
  const m = state.mods;
  const p = state.pathogen;
  const L = state.levels;
  const rng = mulberry32(state.seed + state.week * 104729 + 17);

  const bedCapacity = state.bedCapacity + state.bedQueue;
  const reach = traceReach(state, L.trace);
  const tCut = traceCut(state, L.trace);
  const dCut = distanceCut(state, L.distance);
  const contactFactor = (1 - tCut) * (1 - dCut);
  const betaDay = p.beta * m.density * seasonFactor(state) * (0.94 + rng() * 0.12);

  // Doses ordered weeks ago that become protection today.
  const matured = state.vaxQueue
    .filter((q) => q.week <= state.week)
    .reduce((n, q) => n + q.doses, 0);

  let { s, e, i, r, d } = state;
  const appliedMature = Math.min(s, matured);
  s -= appliedMature;
  r += appliedMature;

  const dosesPerDay = (state.pop * VAX_PER_LEVEL * L.vaccine) / DAYS_PER_WEEK;
  const importsPerDay = (m.imports * (1 - dCut)) / DAYS_PER_WEEK;

  let newExposed = 0, toInfectious = 0, removed = 0, deaths = 0, recovered = 0;
  let doses = 0, waned = 0, peakCare = 0, worstOverflow = 0;

  for (let day = 0; day < DAYS_PER_WEEK; day++) {
    const care = i * p.hosp;
    if (care > peakCare) peakCare = care;
    const overflow = care > bedCapacity && care > 0 ? (care - bedCapacity) / care : 0;
    if (overflow > worstOverflow) worstOverflow = overflow;

    const share = s / state.pop;
    const exposedNow = Math.min(s, betaDay * contactFactor * i * share + importsPerDay * share);
    const infectiousNow = e / p.incubation;
    const removedNow = i / p.infectious;
    const deathsNow = removedNow * p.ifr * m.ageing * (1 + 2.4 * overflow);
    const recoveredNow = removedNow - deathsNow;
    const wanedNow = (r * p.waning) / DAYS_PER_WEEK;
    const dosedNow = Math.min(Math.max(0, s - exposedNow), dosesPerDay);

    s = s - exposedNow + wanedNow;
    e = e + exposedNow - infectiousNow;
    i = i + infectiousNow - removedNow;
    r = r + recoveredNow - wanedNow;
    d = d + deathsNow;

    newExposed += exposedNow;
    toInfectious += infectiousNow;
    removed += removedNow;
    deaths += deathsNow;
    recovered += recoveredNow;
    waned += wanedNow;
    doses += dosedNow;
  }

  const spend = weeklySpend(L, state.pop, state.builtBeds);
  const income = round2(state.baseFunds * m.funding * economyFactor(state, L.distance));

  // Public patience: distancing burns it, quiet weeks restore it, and a bad
  // week of deaths frightens people back into line — always a week too late.
  const fear = clamp(state.lastDeaths / Math.max(1, state.pop * 0.00006), 0, 1);
  const drain = 0.09 * L.distance * m.fatigue;
  const rest = L.distance <= 1 ? 0.035 : 0;
  const complianceDelta = clamp(-drain + rest + 0.06 * fear, -0.3, 0.12);

  return {
    week: state.week,
    levels: { ...L },
    reach, traceCut: tCut, distanceCut: dCut, contactFactor,
    bedCapacity, peakCare, overflow: worstOverflow,
    newExposed, toInfectious, removed, deaths, recovered, waned,
    doses, matured: appliedMature, maturesAt: state.week + p.vaccineLag + m.vaccineDelay,
    spend, income, complianceDelta,
    next: { s, e, i, r, d },
    // Rounded figures the briefing reads off.
    newCases: Math.round(toInfectious),
    active: Math.round(i),
    deathsShown: Math.round(deaths),
  };
}

/** Apply a simulated week to the state and move the calendar forward. */
export function commitWeek(state, result) {
  Object.assign(state, result.next);

  state.bedCapacity += state.bedQueue;
  state.builtBeds += state.bedQueue;
  state.bedQueue = state.pop * BED_PER_LEVEL * state.levels.beds;

  state.vaxQueue = state.vaxQueue.filter((q) => q.week > state.week);
  if (result.doses > 0) state.vaxQueue.push({ week: result.maturesAt, doses: result.doses });

  state.funds = round2(state.funds - result.spend + result.income);

  // A ward you cannot staff is a ward that closes. Rather than strand the
  // player in debt, exactly enough beds shut to balance the books — the same
  // bargain `affordLevels` strikes with the levers.
  result.bedsClosed = 0;
  if (state.funds < 0 && state.builtBeds > 0) {
    const closed = Math.min(state.builtBeds, -state.funds / BED_UPKEEP_PER_BED);
    state.builtBeds -= closed;
    state.bedCapacity -= closed;
    state.funds = 0;
    result.bedsClosed = closed;
  }
  state.compliance = clamp(state.compliance + result.complianceDelta, 0.1, 1);
  state.lastDeaths = result.deaths;

  result.notes = surveillanceNotes(state, result);
  state.history.push(result);
  state.week += 1;
  state.phase = state.week > state.weeks ? 'gameover' : 'briefing';
  return state;
}

/**
 * What the week taught you. Deliberately qualitative — the hidden traits are
 * never printed, so you read them off the wards and the labs instead.
 */
export function surveillanceNotes(state, result) {
  const p = state.pathogen;
  const L = result.levels;
  const notes = [];

  if (L.trace >= 2 && result.reach < 0.4) {
    notes.push('The labs are swamped. Most contacts are never reached at all.');
  } else if (L.trace >= 2 && result.reach > 0.6 && p.traceability < 0.5) {
    notes.push('Contacts keep testing positive before they ever felt ill — tracing arrives too late.');
  } else if (L.trace >= 2 && result.reach > 0.5 && p.traceability >= 0.75) {
    notes.push('Tracers are reaching contacts before they pass it on.');
  }

  if (L.distance >= 3 && p.contactSensitivity < 0.4) {
    notes.push('Everything is shut and the curve has barely noticed. This is not spreading person to person.');
  } else if (L.distance >= 3 && state.compliance > 0.6 && p.contactSensitivity > 1.0) {
    notes.push('Closing indoor spaces bit hard this week.');
  }

  if (state.compliance < 0.4) {
    notes.push('Patience is gone. The restrictions exist on paper only.');
  } else if (result.complianceDelta < -0.1) {
    notes.push('People are tiring of this.');
  }

  if (result.bedsClosed > 1) {
    notes.push(`${Math.round(result.bedsClosed).toLocaleString('en-US')} beds closed — there was no money left to staff them.`);
  }
  if (result.overflow > 0.08) {
    notes.push(`Wards ran ${Math.round(result.overflow * 100)}% over capacity — people died who would have lived with a bed.`);
  }
  if (result.matured > 1) {
    notes.push(`${Math.round(result.matured).toLocaleString('en-US')} vaccinated are now protected.`);
  } else if (L.vaccine > 0 && state.vaxQueue.length > 0) {
    const next = Math.min(...state.vaxQueue.map((q) => q.week));
    notes.push(`Doses are going in, but nobody is protected until week ${next}.`);
  }
  if (result.waned > state.pop * 0.002) {
    notes.push('Recovered cases are turning up positive again. Immunity is not holding.');
  }
  if (state.mods.imports > 0 && state.i < state.pop * 0.001) {
    notes.push('Cases keep arriving from outside the district.');
  }
  if (notes.length === 0) {
    notes.push(result.newCases < state.pop * 0.0004
      ? 'A quiet week. Almost no new cases.'
      : 'Nothing new from surveillance.');
  }
  return notes.slice(0, 4);
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

/**
 * Cumulative deaths, week by week, if nobody does anything at all. The last
 * entry is the bar the whole run is measured from; the earlier ones let the
 * HUD show lives saved as you go rather than only at the end.
 */
export function baselineTrajectory(config) {
  const state = rawRun(config);
  const out = [];
  while (state.phase !== 'gameover') {
    state.levels = { ...NO_LEVELS };
    commitWeek(state, simulateWeek(state));
    out.push(state.d);
  }
  return out;
}

/** Deaths if nobody does anything at all — the bar every run is measured from. */
export function baselineDeaths(config) {
  const trajectory = baselineTrajectory(config);
  return trajectory[trajectory.length - 1] ?? 0;
}

export function livesSaved(state) {
  return Math.max(0, state.baselineDeaths - state.d);
}

export function finalScore(state) {
  const saved = livesSaved(state);
  const peak = state.history.reduce((a, h) => Math.max(a, h.peakCare), 0);
  const everInfected = state.d + state.r + state.i + state.e;
  return {
    deaths: Math.round(state.d),
    baselineDeaths: Math.round(state.baselineDeaths),
    saved: Math.round(saved),
    savedShare: state.baselineDeaths > 0 ? saved / state.baselineDeaths : 0,
    infected: Math.round(everInfected),
    attackRate: everInfected / state.pop,
    peakCare: Math.round(peak),
    fundsLeft: round2(state.funds),
    compliance: state.compliance,
    target: state.target,
    won: state.target == null ? null : Math.round(saved) >= state.target,
    rank: rankFor(state.baselineDeaths > 0 ? saved / state.baselineDeaths : 0),
  };
}

function rankFor(share) {
  if (share >= 0.9) return { title: 'Containment', icon: '🛡️' };
  if (share >= 0.75) return { title: 'Held the Line', icon: '🏅' };
  if (share >= 0.55) return { title: 'Blunted It', icon: '📉' };
  if (share >= 0.3) return { title: 'Slowed It', icon: '⏳' };
  if (share >= 0.1) return { title: 'Overrun', icon: '😞' };
  return { title: 'Catastrophe', icon: '💀' };
}

/* ------------------------------------------------------------------ *
 * Reference play
 *
 * A bot used to set each district's target ("par"). It plays a small family
 * of policies against the district's own pathogen, population and budget and
 * keeps the best. Because the search happens on the district itself, the
 * target is calibrated automatically — a mosquito-borne outbreak in a broke
 * district gets an honestly lower bar than a traceable flu in a rich one,
 * without anyone balancing 625 numbers by hand.
 * ------------------------------------------------------------------ */

/**
 * The knobs the reference bot searches over.
 *
 * The family has to contain the best play available, or par understates what
 * the district can give and the targets come out too soft. It must therefore
 * span the levers at full strength, and — because opening beds early and
 * holding them is a genuinely different policy from opening them once the
 * wards fill — both sides of that timing question.
 *
 * Combinations that would only duplicate another are dropped: a policy that
 * never closes anything has no threshold to close at, and one that never
 * builds beds has no timing to choose.
 */
export const POLICIES = (() => {
  const out = [];
  for (const distLevel of [0, 2, 3, 5]) {
    // Nothing to threshold if you never close anything.
    for (const distFrom of distLevel === 0 ? [0] : [0.0003, 0.0015]) {
      for (const vax of [0, 3, MAX_LEVEL]) {
        for (const beds of [0, 3, MAX_LEVEL]) {
          // Nothing to time if you never build a ward.
          for (const bedsEarly of beds === 0 ? [false] : [true, false]) {
            for (const traceOn of [true, false]) {
              // Nothing to prioritise if you never buy a test.
              for (const traceFirst of traceOn ? [true, false] : [false]) {
                out.push({ distLevel, distFrom, vax, beds, bedsEarly, traceOn, traceFirst });
              }
            }
          }
        }
      }
    }
  }
  return out;
})();

/** What the reference bot would do this week under `policy`. */
export function referenceLevels(state, policy) {
  const activeShare = (state.i + state.e) / state.pop;
  const susceptibleShare = state.s / state.pop;

  const want = {
    // Tracing is worth buying while it can still reach anybody.
    trace: policy.traceOn && traceReach(state, MAX_LEVEL) > 0.25 ? MAX_LEVEL : 0,
    distance: activeShare >= policy.distFrom && state.compliance > 0.3 ? policy.distLevel : 0,
    vaccine: susceptibleShare > 0.2 ? policy.vax : 0,
    beds: policy.bedsEarly || state.i * state.pathogen.hosp > state.bedCapacity * 0.7
      ? policy.beds : 0,
  };

  // Trim to what the money covers, in priority order.
  const order = policy.traceFirst ? ['trace', 'beds', 'vaccine'] : ['beds', 'trace', 'vaccine'];
  const levels = { trace: 0, distance: want.distance, vaccine: 0, beds: 0 };
  for (const key of order) {
    for (let n = want[key]; n > 0; n--) {
      const trial = { ...levels, [key]: n };
      if (weeklySpend(trial, state.pop, state.builtBeds) <= state.funds) { levels[key] = n; break; }
    }
  }
  return levels;
}

/** Play a whole run under one policy and report the deaths it ended with. */
export function playPolicy(config, policy) {
  const state = rawRun(config);
  state.baselineDeaths = 0;
  while (state.phase !== 'gameover') {
    state.levels = referenceLevels(state, policy);
    commitWeek(state, simulateWeek(state));
  }
  return state.d;
}

/**
 * Lives the best policy in the family saves on this district.
 * This is what district targets are measured against.
 */
export function parSaved(config) {
  const baseline = baselineDeaths(config);
  let best = baseline;
  for (const policy of POLICIES) {
    const deaths = playPolicy(config, policy);
    if (deaths < best) best = deaths;
  }
  return Math.max(0, baseline - best);
}
