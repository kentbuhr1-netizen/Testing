/**
 * The Ledger — one book of business, a week at a time.
 *
 * A "run" is one lending book at one branch: a stake of your own capital, a
 * pile of other people's deposits, and a queue of people who want to borrow.
 *
 * The decision is not a price and it is not a budget. Applications come to
 * the desk **one at a time**, and each is a yes or a no you cannot take back.
 * You never see the queue behind the file in front of you, so you cannot
 * rank the week and skim the best of it — you have to hold a bar and let
 * things walk past you.
 *
 * Two things make that hard:
 *
 *   1. The file is evidence, not an answer. Every applicant has a true
 *      creditworthiness that is never printed. The books, the standing, the
 *      clerk's remark and the rate they are willing to pay are four noisy
 *      reads on it, and the rate is the *market's* read — which is worse than
 *      yours, if you actually read the file.
 *   2. You find out months later. A loan written in week 3 goes bad in week
 *      11, so you are always judging with an out-of-date sense of your own
 *      accuracy.
 *
 * And underneath both: deposits can be withdrawn on demand, loans cannot be
 * called in. Lending well and lending too much are different mistakes, and
 * the second one kills a perfectly solvent bank.
 *
 * Everything here is pure: give it a state object and it gives numbers back.
 * No DOM, no storage. campaign.js decides which books exist; app.js draws them.
 */

export const START_CAPITAL = 600;        // your own money on the table
export const DEPOSIT_MULTIPLE = 6;       // deposits start at this many times capital
export const DEPOSIT_CEILING = 1.7;      // the town only has so much money to place
export const DEPOSIT_RATE = 0.0022;      // credited to depositors weekly
export const OVERHEAD = 4;               // clerks, coal, rent — owed every week
export const CALM = 0.55;                // the confidence at which deposits hold level
export const FLOW_SENSITIVITY = 0.085;   // how hard confidence pushes the deposit book
export const TRUST_REBUILD = 0.022;      // the ceiling on how fast trust comes back
export const RATE_BASE = 0.03;           // interest on a ten-week loan to a spotless name
export const RATE_SPAN = 0.33;          // ...and the extra a hopeless one is charged
export const RUN_AT = 0.02;              // confidence this low and the doors are shut
/**
 * The spread the business actually lives on.
 *
 * The town prices every borrower as if they were rather worse than they are,
 * which is why lending money is a trade at all. It also means most files are
 * worth writing — so what stops you is not the bar but the safe, and choosing
 * *which* good loans to fund is the whole job.
 */
export const RISK_WEDGE = 0.72;

/** Deterministic PRNG so a book can be replayed (and unit tested). */
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
/** Roughly standard normal, from four uniforms. Cheap and good enough. */
const gauss = (rng) => (rng() + rng() + rng() + rng() - 2) / 0.5774;

/* ------------------------------------------------------------------ *
 * Modifiers — every knob a town, book or tier can turn
 * ------------------------------------------------------------------ */

export const NO_MODS = {
  applicants: 1,     // how many files reach the desk each week
  risk: 1,           // how likely the district is to go bad
  noise: 1,          // how little the file actually tells you
  mispricing: 1,     // how badly the town's rates match the risk
  rateSpread: 1,     // how much extra a shaky name is charged
  loanSize: 1,       // how much they ask for
  term: 1,           // how long they want it for
  depositBase: 1,    // how much of other people's money you are sitting on
  volatility: 1,     // how restless the deposit book is
  skittish: 1,       // how fast confidence goes, and how slowly it returns
  recovery: 1,       // how much security is actually worth when you call it in
  overhead: 1,       // what the branch costs to keep open
  shockChance: 1,    // how often the town takes fright
};

export function withMods(mods) {
  return { ...NO_MODS, ...(mods || {}) };
}

/* ------------------------------------------------------------------ *
 * The file
 *
 * Four visible reads on one hidden number, plus a fifth the applicant does
 * not control: what the market thinks they are worth, expressed as the rate.
 * ------------------------------------------------------------------ */

/** Books kept. Index 0 is worst; the words are all the player ever sees. */
export const BOOKS = [
  'No books to speak of',
  'Figures written up from memory',
  'Books a season out of date',
  'Books clean and current',
];

/** How long they have been around, and who will say so. */
export const STANDING = [
  'Nobody here will vouch for them',
  'New in the district',
  'Known about the town',
  'Banked here twenty years',
];

/** The clerk's line. Six bands, so it carries more than the other two. */
export const REMARKS = [
  'The clerk would not have let them past the counter.',
  'Something about the story does not sit right.',
  'Plausible enough. Nothing you could point at.',
  'Straightforward, as far as it went.',
  'Everything asked for, produced without fuss.',
  'The clerk says you could lend on their word alone.',
];

/**
 * What the money is for. Visible, and genuinely informative: the purpose
 * shifts the applicant's true quality rather than merely correlating with it.
 */
export const PURPOSES = [
  { id: 'tools',       label: 'A second van, the work already contracted', shift: 0.10 },
  { id: 'stock',       label: 'Stock for the season',                      shift: 0.06 },
  { id: 'premises',    label: 'Extending the premises',                    shift: 0.02 },
  { id: 'harvest',     label: 'Carrying them through to the harvest',      shift: -0.02 },
  { id: 'partner',     label: 'Buying out a partner',                      shift: -0.06 },
  { id: 'start',       label: 'Starting up on their own account',          shift: -0.10 },
  { id: 'family',      label: 'A family matter they would rather not detail', shift: -0.12 },
  { id: 'consolidate', label: 'Clearing what they owe elsewhere',          shift: -0.15 },
];

const SURNAMES = ['Hollis', 'Marchbank', 'Trewin', 'Ashby', 'Pengelly', 'Fairbairn',
  'Ruddock', 'Naismith', 'Colquhoun', 'Danby', 'Ewart', 'Garrow', 'Halloran', 'Ives',
  'Jerrold', 'Kinsella', 'Lammas', 'Mostyn', 'Netherwood', 'Oughton', 'Pargeter',
  'Quarrie', 'Rowntree', 'Standish', 'Tunnicliffe', 'Verity', 'Wakelin', 'Yelverton'];
const TRADES = ['drapers', 'corn merchants', 'the ironmonger', 'a jobbing builder',
  'the carrier', 'coopers', 'the printer', 'a market gardener', 'the saddler',
  'sailmakers', 'the miller', 'a haulier', 'the chemist', 'wheelwrights',
  'the tannery', 'a bootmaker', 'the brewer', 'a fishmonger'];

/**
  * Turn a hidden quality into the chance this borrower goes under, expressed
  * over a standard ten weeks.
  */
export function riskFor(quality, mods = NO_MODS) {
  return clamp(0.66 * Math.pow(1 - clamp(quality, 0, 1), 1.25) * mods.risk, 0.015, 0.85);
}

/**
 * The chance a loan of this length goes bad.
 *
 * Risk is a weekly hazard, not a fixed coin flip, so a longer loan has more
 * time to go wrong in the same proportion that it earns more interest. Without
 * that, long money would be strictly better than short money and the term on
 * the file would carry no decision at all.
 */
export function defaultChance(quality, term, mods = NO_MODS) {
  return 1 - Math.pow(1 - riskFor(quality, mods), term / 10);
}

/**
 * What the town charges someone it grades at `grade`.
 *
 * The rate is priced off the *market's* estimate of how likely they are to
 * stop paying — which is the same curve the district's own riskiness moves.
 * A district where everybody goes bad charges everybody more; without that,
 * a hard district would simply be a worse version of an easy one rather than
 * a different problem.
 */
export function rateFor(grade, term, mods = NO_MODS) {
  const priced = riskFor(grade * RISK_WEDGE, mods) / 0.66;
  return (RATE_BASE + RATE_SPAN * priced * mods.rateSpread) * (term / 10);
}

/** Read the market's grade back out of the rate it quoted. Exact inverse. */
export function gradeFromRate(app, mods = NO_MODS) {
  const priced = ((app.rate / (app.term / 10)) - RATE_BASE) / (RATE_SPAN * mods.rateSpread);
  const raw = priced / mods.risk;
  return clamp((1 - Math.pow(clamp(raw, 0, 1), 1 / 1.25)) / RISK_WEDGE, 0, 1);
}

/** Bucket a noisy read of quality into one of `n` words. */
function bucket(value, n) {
  return clamp(Math.floor(value * n), 0, n - 1);
}

/**
 * Build one application. The true quality, and whether and when they stop
 * paying, are rolled here — before a single decision is made — so a seed
 * always replays the same book with the same outcomes.
 */
function buildApplication(rng, mods, week, id) {
  const purpose = PURPOSES[Math.floor(rng() * PURPOSES.length)];
  const quality = clamp(0.15 + rng() * 0.75 + purpose.shift, 0.02, 0.98);
  const risk = riskFor(quality, mods);

  const sigma = 0.24 * mods.noise;
  const signals = {
    books: bucket(clamp(quality + gauss(rng) * sigma, 0, 0.999), BOOKS.length),
    standing: bucket(clamp(quality + gauss(rng) * sigma, 0, 0.999), STANDING.length),
    remark: bucket(clamp(quality + gauss(rng) * sigma, 0, 0.999), REMARKS.length),
  };

  // What the town thinks they are worth. Noisier than the file, and that gap
  // is the whole opportunity: the rate is the market's opinion, not the truth.
  // `noise` blurs what you can read; `mispricing` blurs what the town charges.
  // They are separate knobs because they pull opposite ways — a town whose
  // files say nothing is hard, and a town whose rates are wild is lucrative
  // to anyone who can still read a man.
  const grade = clamp(quality + gauss(rng) * 0.30 * mods.mispricing, 0, 1);

  const term = clamp(Math.round((4 + rng() * 7) * mods.term), 3, 18);
  const amount = Math.round((100 + rng() * 220) * mods.loanSize);
  const rate = round2(rateFor(grade, term, mods) * 1000) / 1000;
  const security = round2(clamp(0.25 + rng() * 0.45 + 0.15 * (quality - 0.5), 0, 0.8) * mods.recovery);

  const chance = defaultChance(quality, term, mods);
  const goesBad = rng() < chance;
  const defaultAt = goesBad ? Math.floor(rng() * term) : null;

  return {
    id,
    week,
    name: `${SURNAMES[Math.floor(rng() * SURNAMES.length)]}, ${TRADES[Math.floor(rng() * TRADES.length)]}`,
    purpose: purpose.id,
    purposeLabel: purpose.label,
    purposeShift: purpose.shift,
    amount,
    term,
    rate,                  // total interest over the whole term, not per year
    security,
    signals,
    // Hidden from here down. Nothing in js/ui reads any of it.
    quality: round2(quality),
    risk: round2(risk),
    chance: round2(chance),
    defaultAt,
  };
}

/**
 * What the applicant will hand back in total if they see it through.
 *
 * Loans here are bullet loans: interest every week, the principal back in one
 * piece at the end. That is what makes "you cannot call a loan in" mean
 * something — the money is gone for the whole term, and a depositor who wants
 * theirs on Friday does not care that it comes back in six weeks.
 */
export const totalDue = (app) => round2(app.amount * (1 + app.rate));
export const interestOf = (app) => round2(app.amount * app.rate / app.term);

/* ------------------------------------------------------------------ *
 * The week script
 *
 * Deposit noise and the town's frights are pre-rolled for the whole run, so
 * they cannot depend on the order you happen to click things in. Confidence
 * still moves with what you do — that is the sim — but the dice do not.
 * ------------------------------------------------------------------ */

function buildScript(rng, mods, weeks) {
  const script = [];
  for (let w = 0; w <= weeks + 1; w++) {
    const frightened = rng() < 0.12 * mods.shockChance;
    script.push({
      noise: round2(gauss(rng) * 0.018 * mods.volatility * 1000) / 1000,
      fright: frightened,
      frightSize: round2((0.08 + rng() * 0.16) * mods.volatility * 1000) / 1000,
      frightNote: FRIGHTS[Math.floor(rng() * FRIGHTS.length)],
    });
  }
  return script;
}

const FRIGHTS = [
  'A bank two counties over has shut its doors. People here would like to see their money.',
  'The mill has laid off a shift, and half the town wants something in hand.',
  'A rumour got about that your book is full of bad paper.',
  'Quarter day. Everybody wants cash at once.',
  'The newspaper ran a piece about country banks. It was not kind.',
];

/* ------------------------------------------------------------------ *
 * Starting a book
 * ------------------------------------------------------------------ */

export function newRun({
  seed = Math.floor(Math.random() * 1e9),
  weeks = 14,
  stake = START_CAPITAL,
  target = null,
  mods = null,
  book = null,
} = {}) {
  const m = withMods(mods);
  const rng = mulberry32(seed ^ 0x51ab3c7d);

  const applications = [];
  let nextId = 0;
  for (let w = 1; w <= weeks; w++) {
    const count = clamp(Math.round((5 + rng() * 4) * m.applicants), 1, 12);
    const batch = [];
    for (let i = 0; i < count; i++) batch.push(buildApplication(rng, m, w, nextId++));
    applications.push(batch);
  }

  const deposits = Math.round(stake * DEPOSIT_MULTIPLE * m.depositBase);

  const state = {
    seed,
    week: 1,
    weeks,
    stake,
    target,
    book,
    mods: m,
    cash: stake + deposits,
    deposits,
    depositCap: Math.round(deposits * DEPOSIT_CEILING),
    confidence: 0.62,
    loans: [],
    applications,
    script: buildScript(rng, m, weeks),
    at: 0,                 // which file on this week's desk
    written: 0,
    declined: 0,
    history: [],
    failed: null,
    phase: 'morning',
  };
  return state;
}

/* ------------------------------------------------------------------ *
 * Reading the state
 * ------------------------------------------------------------------ */

export const liveLoans = (state) => state.loans.filter((l) => l.status === 'live');

/** Principal still out on the street, at book value. */
export function bookValue(state) {
  return round2(liveLoans(state).reduce((n, l) => n + l.principal, 0));
}

/** Cash + what is owed to you − what you owe. The number you are scored on. */
export function capital(state) {
  return round2(state.cash + bookValue(state) - state.deposits);
}

/** The reserve everybody can see: cash against deposits. */
export const reserveRatio = (state) => state.cash / Math.max(1, state.deposits);

/** This week's desk, and the file in front of you. */
export const deskQueue = (state) => state.applications[state.week - 1] || [];
export const currentFile = (state) => deskQueue(state)[state.at] || null;
export const filesLeft = (state) => Math.max(0, deskQueue(state).length - state.at);

/** What is already promised to arrive next week, if nobody stops paying. */
export function repaymentsDue(state) {
  return round2(liveLoans(state).reduce(
    (n, l) => n + l.instalment + (l.weeksPaid + 1 >= l.term ? l.principal : 0), 0));
}

/**
 * What the town is likely to take out this week — the forecast the player
 * plans against. Deliberately a range: the drift is knowable, the noise and
 * the frights are not.
 */
export function withdrawalForecast(state) {
  let drift = state.deposits * (state.confidence - CALM) * FLOW_SENSITIVITY;
  if (drift > 0) drift *= clamp(1 - state.deposits / state.depositCap, 0, 1);
  const swing = state.deposits * 0.036 * state.mods.volatility;
  return { middle: round2(-drift), low: round2(-drift - swing), high: round2(-drift + swing) };
}

/**
 * Exactly what the town will do with its money this week.
 *
 * Confidence and deposits only move when the week is settled, and the noise
 * and the frights were rolled from the seed before the run began — so this is
 * knowable now, and `settleWeek` uses this very function rather than a second
 * copy of the arithmetic. It is deliberately *not* shown: what the player
 * normally gets is `withdrawalForecast`, which is a range.
 */
export function projectedFlow(state) {
  const script = state.script[state.week] || { noise: 0, fright: false, frightSize: 0, frightNote: null };
  let drift = state.deposits * (state.confidence - CALM) * FLOW_SENSITIVITY;
  // The inflow tapers off as the deposit book approaches what the district holds.
  if (drift > 0) drift *= clamp(1 - state.deposits / state.depositCap, 0, 1);
  let flow = drift + state.deposits * script.noise;
  if (script.fright) flow -= state.deposits * script.frightSize;
  return { flow: round2(flow), fright: script.fright ? script.frightNote : null };
}

/** A fifth reading on an applicant, which the game never gives away for free. */
export const OPINIONS = [
  'Asked around, and nobody would put their name to them.',
  'One or two people looked uncomfortable when asked.',
  'Nothing much either way. They are not talked about.',
  'Spoken of as good for it, by people who would know.',
  'Everyone asked said the same thing: they pay.',
];

/**
 * Buy a second opinion on the file at the desk.
 *
 * Drawn from the run's own seed and cached on the application, so claiming it
 * twice — or reloading the page — cannot reroll it into a better answer. It is
 * another noisy read, not the truth: it can be wrong like the other four.
 */
export function secondOpinion(state, app) {
  if (!app) return null;
  if (app.extraReading != null) return app.extraReading;
  const rng = mulberry32((state.seed ^ ((app.id + 1) * 2654435761)) >>> 0);
  const sigma = 0.2 * state.mods.noise;
  app.extraReading = bucket(clamp(app.quality + gauss(rng) * sigma, 0, 0.999), OPINIONS.length);
  return app.extraReading;
}

/* ------------------------------------------------------------------ *
 * The desk — one file, one answer, no going back
 * ------------------------------------------------------------------ */

/** Could this loan even be written? You cannot lend money you do not hold. */
export function canWrite(state, app) {
  return Boolean(app) && app.amount <= state.cash;
}

/**
 * Say yes or no to the file in front of you and turn to the next one.
 *
 * Irreversible on purpose. The whole game is that you must set a bar and
 * hold it without knowing what is behind the applicant standing there.
 */
export function decide(state, approve) {
  const app = currentFile(state);
  if (!app || state.phase !== 'desk') return null;

  let outcome = { app, approved: false, why: null };
  if (approve) {
    if (!canWrite(state, app)) {
      outcome.why = 'There is not that much cash in the building.';
    } else {
      state.cash = round2(state.cash - app.amount);
      state.loans.push({
        id: app.id,
        name: app.name,
        principal: app.amount,
        instalment: interestOf(app),
        term: app.term,
        weeksPaid: 0,
        collected: 0,
        security: app.security,
        defaultAt: app.defaultAt,
        writtenWeek: state.week,
        status: 'live',
        recovered: 0,
      });
      state.written += 1;
      outcome.approved = true;
    }
  } else {
    state.declined += 1;
  }

  state.at += 1;
  if (state.at >= deskQueue(state).length) state.phase = 'settle';
  return outcome;
}

/**
 * Send the applicant at the desk to the back of today's queue.
 *
 * The one thing the core loop never lets you do is look before you leap, so
 * this is the only place it bends — for one file, once, and only while there
 * is somebody behind them to see first. They still have to be answered before
 * the week can be settled.
 */
export function deferFile(state) {
  if (state.phase !== 'desk') return false;
  const queue = deskQueue(state);
  const app = queue[state.at];
  if (!app || app.deferred) return false;
  if (state.at >= queue.length - 1) return false;   // nobody behind them anyway
  app.deferred = true;
  queue.splice(state.at, 1);
  queue.push(app);
  return true;
}

/** Turn away everything still waiting. A perfectly ordinary week. */
export function closeDesk(state) {
  while (state.phase === 'desk' && currentFile(state)) decide(state, false);
}

/* ------------------------------------------------------------------ *
 * Settling the week
 * ------------------------------------------------------------------ */

/**
 * Run the week's end. Pure: reads the state and returns a report including
 * the numbers it wants applied. Repayments and defaults land first, then the
 * town decides how much of its money it would like back — which is why the
 * lending happens before this and not after.
 */
export function settleWeek(state) {
  const mods = state.mods;
  const script = state.script[state.week] || { noise: 0, fright: false, frightSize: 0 };

  let cash = state.cash;
  let collected = 0;
  const defaults = [];
  const repaid = [];
  const loans = state.loans.map((l) => ({ ...l }));

  for (const loan of loans) {
    if (loan.status !== 'live') continue;
    if (loan.defaultAt != null && loan.weeksPaid >= loan.defaultAt) {
      const outstanding = loan.principal;
      const recovered = round2(outstanding * loan.security);
      loan.status = 'default';
      loan.recovered = recovered;
      cash = round2(cash + recovered);
      defaults.push({
        id: loan.id, name: loan.name, outstanding, recovered,
        weeks: state.week - loan.writtenWeek,
      });
      continue;
    }
    cash = round2(cash + loan.instalment);
    collected = round2(collected + loan.instalment);
    loan.weeksPaid += 1;
    loan.collected = round2(loan.collected + loan.instalment);
    if (loan.weeksPaid >= loan.term) {
      // Maturity: the principal comes back in one piece, or not at all.
      loan.status = 'repaid';
      cash = round2(cash + loan.principal);
      repaid.push({ id: loan.id, name: loan.name, principal: loan.principal });
    }
  }

  // --- what the town does with its money
  const projected = projectedFlow(state);
  const flow = projected.flow;
  const fright = projected.fright;

  let deposits = state.deposits;
  let paidOut = 0;
  let shortfall = 0;
  if (flow >= 0) {
    deposits = round2(deposits + flow);
    cash = round2(cash + flow);
  } else {
    const wanted = round2(-flow);
    paidOut = round2(Math.min(cash, wanted));
    shortfall = round2(wanted - paidOut);
    cash = round2(cash - paidOut);
    deposits = round2(deposits - paidOut);
  }

  // --- what the week costs whatever happens
  const interest = round2(deposits * DEPOSIT_RATE);
  deposits = round2(deposits + interest);
  const overhead = round2(OVERHEAD * mods.overhead);
  cash = round2(cash - overhead);

  // --- confidence: lost in an afternoon, rebuilt over months
  let confidence = state.confidence;
  let trustNote = null;
  if (shortfall > 0) {
    const share = shortfall / Math.max(1, shortfall + paidOut);
    confidence -= (0.22 + 0.55 * share) * mods.skittish;
    trustNote = 'You could not pay everyone who asked. That gets about within the hour.';
  } else {
    confidence += TRUST_REBUILD * (1 - confidence) / mods.skittish;
  }
  const ratio = cash / Math.max(1, deposits);
  if (defaults.length) confidence -= 0.017 * defaults.length * mods.skittish;
  if (ratio < 0.12) confidence -= 0.03 * mods.skittish;
  else if (ratio > 0.3) confidence += 0.006;
  confidence = clamp(confidence, 0, 1);

  const next = { cash, deposits, confidence, loans };
  const report = {
    week: state.week,
    written: deskQueue(state).filter((a) => loans.some((l) => l.id === a.id)).length,
    seen: deskQueue(state).length,
    collected: round2(collected),
    repaid,
    returned: round2(repaid.reduce((n, r) => n + r.principal, 0)),
    defaults,
    badDebt: round2(defaults.reduce((n, d) => n + d.outstanding - d.recovered, 0)),
    flow,
    paidOut,
    shortfall,
    fright,
    interest,
    overhead,
    confidenceBefore: round2(state.confidence),
    confidenceAfter: round2(confidence),
    trustNote,
    cash,
    deposits,
    next,
  };
  return report;
}

/** Apply a settled week and move the calendar forward. */
export function commitWeek(state, report) {
  state.loans = report.next.loans;
  state.cash = report.next.cash;
  state.deposits = report.next.deposits;
  state.confidence = report.next.confidence;

  report.capital = capital(state);
  report.notes = weekNotes(state, report);
  state.history.push(report);

  // Two ways to lose, and they are not the same mistake.
  if (state.confidence <= RUN_AT) {
    state.failed = 'run';
    state.phase = 'gameover';
  } else if (capital(state) <= 0) {
    state.failed = 'insolvent';
    state.phase = 'gameover';
  } else if (state.week >= state.weeks) {
    state.phase = 'gameover';
  } else {
    state.week += 1;
    state.at = 0;
    state.phase = 'morning';
  }
  return state;
}

/** Move from the morning briefing to the first file of the week. */
export function openDesk(state) {
  if (state.phase === 'morning') state.phase = deskQueue(state).length ? 'desk' : 'settle';
  return state;
}

/**
 * What the town is saying. This is the only read you get on your own
 * judgement, and it arrives long after the decisions that caused it.
 */
export function weekNotes(state, report) {
  const notes = [];
  if (report.fright) notes.push(report.fright);
  if (report.trustNote) notes.push(report.trustNote);
  for (const d of report.defaults) {
    notes.push(`${d.name} have stopped paying — ${weeks(d.weeks)} after you wrote it. ` +
      `$${d.outstanding.toFixed(2)} still out, and the security covers $${d.recovered.toFixed(2)}.`);
  }

  // The delayed, qualitative read on how you have been lending. Never a rate.
  const settled = state.loans.filter((l) => l.status !== 'live');
  if (settled.length >= 5) {
    const bad = settled.filter((l) => l.status === 'default').length / settled.length;
    if (bad > 0.42) notes.push('People are saying you will lend to anybody with a story.');
    else if (bad > 0.26) notes.push('One or two of the names on your book are being talked about.');
    else if (bad < 0.1) notes.push('Your book has a name for being clean.');
  }
  if (state.written > 0 && state.declined / Math.max(1, state.written + state.declined) > 0.8) {
    notes.push('The town says you never lend. Some of them have stopped asking.');
  }
  const ratio = reserveRatio(state);
  if (ratio < 0.1) notes.push('There is very little cash in the safe. One bad week would show it.');
  if (notes.length === 0) notes.push('A quiet week. The book ticks over.');
  return notes.slice(0, 6);
}

const weeks = (n) => `${n} week${n === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

export function finalScore(state) {
  const settled = state.loans.filter((l) => l.status !== 'live');
  const bad = settled.filter((l) => l.status === 'default').length;
  const cap = capital(state);
  const net = round2(cap - state.stake);
  return {
    capital: cap,
    net,
    written: state.written,
    declined: state.declined,
    defaults: state.loans.filter((l) => l.status === 'default').length,
    badRate: settled.length ? round2(bad / settled.length) : 0,
    cash: round2(state.cash),
    deposits: round2(state.deposits),
    confidence: round2(state.confidence),
    failed: state.failed,
    target: state.target,
    won: state.target == null ? null : (!state.failed && net >= state.target),
    rank: rankFor(net, state),
  };
}

function rankFor(net, state) {
  if (state.failed === 'run') return { title: 'The Doors Are Shut', icon: '🚪' };
  if (state.failed === 'insolvent') return { title: 'Wound Up', icon: '⚰️' };
  if (net >= state.stake * 0.6) return { title: 'A Bank Of Standing', icon: '👑' };
  if (net >= state.stake * 0.3) return { title: 'A Good Year', icon: '🏆' };
  if (net >= state.stake * 0.1) return { title: 'Sound Enough', icon: '📗' };
  if (net > 0) return { title: 'Barely Ahead', icon: '📒' };
  return { title: 'Down On The Year', icon: '📕' };
}

/* ------------------------------------------------------------------ *
 * Reference play
 *
 * Bots used to set each book's target ("par"). Every one of them reads only
 * what a player can read — the four words on the file, the purpose, the rate
 * and the security — and none of them is allowed near `quality`, `risk` or
 * `defaultAt`. A target measured against an oracle would be no target at all.
 *
 * The family deliberately contains the obvious bad strategies as well as the
 * good ones. If "approve everything" or "take the highest rate going" ever
 * beat the careful policies, par would be measuring the wrong thing, and the
 * design would be what needed fixing.
 * ------------------------------------------------------------------ */

/** Bucket index → the middle of the quality band it stands for. */
const mid = (index, n) => (index + 0.5) / n;

/**
 * Everything visible about a file, boiled down to an estimate of quality.
 * `gradeWeight` is how much notice the bot takes of the rate — the market's
 * opinion, which is noisier than the file but free.
 */
export function readFile(app, { gradeWeight = 0.35, purposeWeight = 1 } = {}, mods = NO_MODS) {
  const fromFile = (mid(app.signals.books, BOOKS.length)
    + mid(app.signals.standing, STANDING.length)
    + mid(app.signals.remark, REMARKS.length)) / 3;
  const shift = app.purposeShift * purposeWeight;
  return clamp(fromFile * (1 - gradeWeight) + gradeFromRate(app, mods) * gradeWeight + shift, 0.02, 0.98);
}

/**
 * What a bot thinks this loan is worth, as a return on the money lent.
 *
 * A defaulter is assumed to stop about halfway through, which is what the
 * uniform default week averages out to. That is an estimate a player could
 * make too — it is not privileged information.
 */
export function expectedReturn(app, estimate, mods = NO_MODS) {
  const p = defaultChance(estimate, app.term, mods);
  // A defaulter stops about halfway through, which is what a uniform default
  // week averages out to, so you keep roughly half the interest and whatever
  // the security is worth. The principal is the thing you lose.
  const kept = app.security + app.rate * 0.5;
  return (1 - p) * app.rate - p * (1 - kept);
}

export const POLICIES = (() => {
  const out = [
    // The naive ends of the spectrum, kept in the family on purpose.
    { id: 'approve-all', kind: 'all' },
    { id: 'decline-all', kind: 'none' },
  ];
  // "Only the safest-looking" — reads the file, ignores what it pays.
  for (const bar of [0.55, 0.62, 0.7, 0.78]) {
    out.push({ id: `safest-${bar}`, kind: 'safest', bar, reserve: 0.15 });
  }
  // "Take the best rate going" — the yield chaser.
  for (const min of [0.06, 0.1, 0.14]) {
    out.push({ id: `rate-${min}`, kind: 'rate', min, reserve: 0.15 });
  }
  // The real family: weigh the file against what the loan pays, and keep
  // enough cash back to survive a fright.
  for (const bar of [0, 0.02, 0.035, 0.05, 0.08, 0.12]) {
    for (const reserve of [0.02, 0.18]) {
      for (const gradeWeight of [0, 0.3]) {
        for (const share of [0.12, 0.3]) {
          out.push({ id: `ev-${bar}-${reserve}-${gradeWeight}-${share}`,
            kind: 'ev', bar, reserve, gradeWeight, share });
        }
      }
    }
  }
  return out;
})();

/** Would this policy write this loan? Sees only what a player sees. */
export function referenceDecision(state, app, policy) {
  if (!canWrite(state, app)) return false;
  const after = state.cash - app.amount;
  const reserve = policy.reserve ?? 0;
  if (policy.kind === 'none') return false;
  if (policy.kind === 'all') return true;
  if (after / Math.max(1, state.deposits) < reserve) return false;
  if (policy.share != null && app.amount > state.cash * policy.share) return false;

  if (policy.kind === 'safest') {
    return readFile(app, { gradeWeight: 0.25 }, state.mods) >= policy.bar;
  }
  if (policy.kind === 'rate') {
    return app.rate / (app.term / 10) >= policy.min;
  }
  const estimate = readFile(app, { gradeWeight: policy.gradeWeight }, state.mods);
  return expectedReturn(app, estimate, state.mods) >= policy.bar;
}

/** Play a whole book under one policy and report the profit it cleared. */
export function playPolicy(config, policy) {
  const state = newRun({ ...config, target: null });
  while (state.phase !== 'gameover') {
    openDesk(state);
    while (state.phase === 'desk') decide(state, referenceDecision(state, currentFile(state), policy));
    commitWeek(state, settleWeek(state));
  }
  return round2(capital(state) - state.stake);
}

/** Every policy's profit on this book, keyed by policy id. */
export function policyProfits(config) {
  const out = {};
  for (const policy of POLICIES) out[policy.id] = playPolicy(config, policy);
  return out;
}

/**
 * Profit the best policy in the family clears on this book. This is what
 * targets are measured against.
 */
export function parProfit(config) {
  let best = -Infinity;
  for (const policy of POLICIES) {
    const profit = playPolicy(config, policy);
    if (profit > best) best = profit;
  }
  return best;
}
