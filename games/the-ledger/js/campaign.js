/**
 * The Ledger — the campaign.
 *
 * 25 towns, 25 books each. Books inside a town ramp through four difficulty
 * tiers; towns themselves each bend the rules in one distinctive way. Hold
 * all 25 and the town is yours.
 *
 * Targets are not hand-written. Every book's bar comes from `parProfit` —
 * what the best of a family of reference underwriters clears on that exact
 * book, with that town's applicants, rates and frights — scaled by the tier.
 * A town where nobody keeps books and the deposits run out with the tide
 * therefore gets an honestly lower bar than a sleepy one, without anyone
 * balancing 625 numbers by hand.
 */
import { parProfit, mulberry32 } from './sim.js';

export const BOOKS_PER_TOWN = 25;
/**
 * How much of a town you must hold before it counts as taken. Set to all 25;
 * lower it to shorten the campaign without touching anything else.
 */
export const BOOKS_TO_TAKE_TOWN = BOOKS_PER_TOWN;
export const TOWNS_FOR_OPS = 5;   // the branch network unlocks after this many

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export const TIERS = {
  easy: {
    id: 'easy', label: 'Easy', icon: '🟢', weeks: 14, stake: 600, parFactor: 0.4,
    blurb: 'Honest books, a steady town, and time to learn what a good name looks like.',
    mods: { risk: 0.85, noise: 0.85, volatility: 0.8 },
  },
  medium: {
    id: 'medium', label: 'Medium', icon: '🟡', weeks: 18, stake: 560, parFactor: 0.62,
    blurb: 'A fair book. Every loan you write is one you cannot write later.',
    mods: {},
  },
  hard: {
    id: 'hard', label: 'Hard', icon: '🟠', weeks: 22, stake: 520, parFactor: 0.8,
    blurb: 'Thinner capital, worse paper, and a town that takes fright easily.',
    mods: { risk: 1.12, noise: 1.15, skittish: 1.15 },
  },
  impossible: {
    id: 'impossible', label: 'Impossible', icon: '🔴', weeks: 26, stake: 480, parFactor: 0.93,
    blurb: 'Every file read properly and every shilling accounted for, or the doors shut.',
    mods: { risk: 1.18, noise: 1.28, skittish: 1.35, volatility: 1.25, shockChance: 1.3 },
  },
};

/** Which tier each of a town's 25 books belongs to. */
export const TIER_LAYOUT = [
  ...Array(7).fill('easy'),
  ...Array(7).fill('medium'),
  ...Array(7).fill('hard'),
  ...Array(4).fill('impossible'),
];

/* ------------------------------------------------------------------ *
 * Towns
 * ------------------------------------------------------------------ */

const town = (id, name, county, icon, challenge, areas) => ({ id, name, county, icon, challenge, areas });

/** Ordered gentlest to harshest. `mods` merge over the tier's own. */
export const TOWNS = [
  town('marlowgreen', 'Marlow Green', 'Buckinghamshire', '🌳',
    { name: 'Nothing Much Happens', blurb: 'Honest books, steady deposits, and nobody in a hurry. A good place to learn what a sound name looks like.',
      mods: { risk: 0.8, noise: 0.85, volatility: 0.7, shockChance: 0.6 } },
    ['High Street', 'The Green', 'Mill Lane', 'Church Row', 'Bell Yard', 'Old Bridge']),
  town('bexleycross', 'Bexley Cross', 'Kent', '📮',
    { name: 'Everybody Wants A Little', blurb: 'A queue out of the door every Monday, and none of them asking for much.',
      mods: { applicants: 1.5, loanSize: 0.6 } },
    ['Market Square', 'The Cross', 'Fair Field', 'Post Row', 'Hop Yard', 'Almshouse']),
  town('kingsford', 'Kingsford', 'Berkshire', '💷',
    { name: 'Old Money', blurb: 'Sound names, large sums, and rates so thin you can see through them.',
      mods: { risk: 0.68, rateSpread: 0.84, loanSize: 1.3 } },
    ['The Avenue', 'Park Crescent', 'Grange', 'The Close', 'Abbey Gate', 'Weir House']),
  town('whitcombe', 'Whitcombe', 'Dorset', '🌾',
    { name: 'Harvest Money', blurb: 'They borrow in spring and pay in autumn. Your money is gone a long time.',
      mods: { term: 1.5, volatility: 1.3 } },
    ['Corn Exchange', 'Barrow Hill', 'The Tithe', 'Sheepwash', 'Long Furlong', 'Granary']),
  town('saltcoats', 'Saltcoats', 'Ayrshire', '⚓',
    { name: 'The Tide Goes Out', blurb: 'Deposits arrive with the boats and leave with them. Half your book is at sea.',
      mods: { volatility: 1.8, shockChance: 1.4 } },
    ['Harbour', 'The Shore', 'Net Row', 'Kirkgate', 'Salt Pans', 'Quay Head']),
  town('ashgrove', 'Ashgrove', 'Cheshire', '🤐',
    { name: 'Nobody Speaks Ill', blurb: 'Everyone is related to everyone. Nobody will say a word against a neighbour, so the file tells you very little.',
      mods: { noise: 1.45, mispricing: 1.2 } },
    ['The Bank', 'Wych Lane', 'Cross Keys', 'Bower', 'Saltersgate', 'Dane Row']),
  town('ironbridge', 'Ironbridge Vale', 'Shropshire', '🏭',
    { name: 'One Big Employer', blurb: 'Few applications, and each one is most of what you have.',
      mods: { loanSize: 1.8, applicants: 0.65 } },
    ['Foundry', 'Coalport', 'The Vale', 'Furnace Row', 'Tollhouse', 'Ropewalk']),
  town('netherby', 'Netherby', 'Cumbria', '🐑',
    { name: 'A Thin Book', blurb: 'Barely anyone comes in. Turning one down is a week with nothing earning.',
      mods: { applicants: 0.7, loanSize: 1.4 } },
    ['Fellgate', 'The Beck', 'Hall Garth', 'Sheep Fair', 'Stone Row', 'Crossfield']),
  town('blackthorn', 'Blackthorn', 'Yorkshire', '🪨',
    { name: 'Nothing To Secure It On', blurb: 'Rented rooms and borrowed tools. When one goes bad there is nothing to sell.',
      mods: { recovery: 0.64 } },
    ['Kirkgate', 'Briggate', 'The Shambles', 'Low Row', 'Tanpit', 'Wool Hall']),
  town('stourwell', 'Stourwell', 'Worcestershire', '🏦',
    { name: 'The Big Bank Opened', blurb: 'A joint-stock branch on the corner took half the deposits with it. You are lending on very little.',
      mods: { depositBase: 0.8, applicants: 1.3 } },
    ['Bridge Street', 'Severn Row', 'The Butts', 'Glover Lane', 'Cathedral Yard', 'Lich Gate']),
  town('cottermouth', 'Cottermouth', 'Northumberland', '🧾',
    { name: 'Expensive To Keep Open', blurb: 'Coal, clerks and a building far too grand. The week costs you before you have done anything.',
      mods: { overhead: 1.55, applicants: 1.25 } },
    ['Quayside', 'Bank Top', 'The Side', 'Pilgrim Row', 'Coal Staith', 'Castle Garth']),
  town('penhale', 'Penhale', 'Cornwall', '⛏️',
    { name: 'The Mine Is Closing', blurb: 'Everybody swears the lode will hold out. It will not.',
      mods: { risk: 1.22, recovery: 0.85 } },
    ['Wheal Rose', 'Count House', 'Dry Row', 'The Stamps', 'Bal Lane', 'Adit Head']),
  town('larkfield', 'Larkfield', 'Essex', '📈',
    { name: 'A Boom, While It Lasts', blurb: 'Everyone is expanding and everyone is certain. That is exactly the problem.',
      mods: { applicants: 1.6, risk: 1.25, noise: 1.2 } },
    ['New Town', 'The Parade', 'Brick Field', 'Station Road', 'Speculation Row', 'Vine Yard']),
  town('redwharf', 'Redwharf', 'Anglesey', '🌊',
    { name: 'A Nervous Harbour', blurb: 'One bad week and the whole town is at the counter by Thursday.',
      mods: { skittish: 1.6, volatility: 1.4 } },
    ['Red Wharf', 'The Slip', 'Storehouse', 'Cable Row', 'Lifeboat', 'Ferry Green']),
  town('havershill', 'Havershill', 'Suffolk', '📉',
    { name: 'Bad Paper Everywhere', blurb: 'Half the bills in this town have been round it twice already.',
      mods: { risk: 1.18, recovery: 0.82, mispricing: 1.25 } },
    ['Corn Hill', 'Maltings', 'The Rows', 'Guildhall', 'Angel Yard', 'Dovehouse']),
  town('glenmorrow', 'Glenmorrow', 'Perthshire', '🏔️',
    { name: 'Long Money', blurb: 'Nobody here borrows for a season. They borrow for a generation.',
      mods: { term: 1.55, applicants: 0.9 } },
    ['The Glen', 'Kirkton', 'Braeside', 'Muirhead', 'Cairn Row', 'Loch Gate']),
  town('cadwell', 'Cadwell', 'Staffordshire', '🎭',
    { name: 'Everybody Has A Story', blurb: 'The rate quoted has almost nothing to do with the man in front of you.',
      mods: { noise: 1.7, rateSpread: 1.4 } },
    ['Potteries', 'Bottle Bank', 'The Marl', 'Kiln Row', 'Flint Mill', 'Slip House']),
  town('ellerton', 'Ellerton', 'Nottinghamshire', '💸',
    { name: 'Thin Spread', blurb: 'Three banks competing for the same lace money. Nobody pays what the risk is worth.',
      mods: { rateSpread: 0.95, risk: 1.0, mispricing: 0.8 } },
    ['Lace Market', 'Broad Marsh', 'The Rookery', 'Stoney Street', 'Weekday Cross', 'Bridlesmith']),
  town('portmarne', 'Portmarne', 'Devon', '🌩️',
    { name: 'Money On The Tide', blurb: 'Deposits double in June and vanish in November, and nobody tells you which week.',
      mods: { volatility: 2.1, shockChance: 1.8 } },
    ['The Barbican', 'Fish Quay', 'Custom House', 'Rope Walk', 'Sutton Pool', 'Cattewater']),
  town('tarnbeck', 'Tarnbeck', 'Westmorland', '❄️',
    { name: 'Deep Winter', blurb: 'Five months of coal bills and nobody able to pay a thing.',
      mods: { overhead: 1.4, risk: 1.15, volatility: 1.35 } },
    ['Tarn Foot', 'The Ghyll', 'Stone Bridge', 'Rakefoot', 'Sheepfold', 'Bield Row']),
  town('ravensmere', 'Ravensmere', 'Lincolnshire', '🌫️',
    { name: 'You Cannot Tell Who Is Sound', blurb: 'Fen country. The books are fiction and the references are worse.',
      mods: { noise: 1.7, mispricing: 1.25, risk: 1.1 } },
    ['The Fen', 'Drove End', 'Sluice Row', 'Eau Bank', 'Washland', 'Staunch']),
  town('dunmarrow', 'Dunmarrow', 'Fife', '⚙️',
    { name: 'The Yards Are Idle', blurb: 'A shipbuilding town with nothing on the slips. Everything they own is already pledged.',
      mods: { risk: 1.3, recovery: 0.72, skittish: 1.3 } },
    ['The Slips', 'Rivet Row', 'Dock Head', 'Boiler Yard', 'Plater Lane', 'Gantry']),
  town('crowmoor', 'Crowmoor', 'Norfolk', '🕯️',
    { name: 'A Nervous Town', blurb: 'They remember the last bank that failed here. They remember it every week.',
      mods: { skittish: 1.9, volatility: 1.7, shockChance: 1.6 } },
    ['Crow Hill', 'Staithe', 'The Score', 'Beccles Road', 'Marsh End', 'Bell Cage']),
  town('barrowgate', 'Barrowgate', 'Durham', '🧱',
    { name: 'Everything, Slightly', blurb: 'Nothing here is ruinous. All of it is against you.',
      mods: { risk: 1.12, noise: 1.25, volatility: 1.3, skittish: 1.22, overhead: 1.15, recovery: 0.88 } },
    ['Barrow Gate', 'Pit Row', 'The Bailey', 'Framwell', 'Claypath', 'Coker Row']),
  town('kirkwald', 'Kirkwald', 'Orkney', '🌩️',
    { name: 'The Worst Book In Britain', blurb: 'No security, no information, no patience, and a fright every other week.',
      mods: { risk: 1.25, noise: 1.55, mispricing: 1.3, volatility: 1.9, skittish: 1.6,
              shockChance: 1.7, recovery: 0.72, overhead: 1.2 } },
    ['Kirk Wynd', 'The Peerie Sea', 'Bridge End', 'Tankerness', 'Papdale', 'Hatston']),
];

export const TOWN_INDEX = Object.fromEntries(TOWNS.map((t, i) => [t.id, i]));
export const getTown = (id) => TOWNS[TOWN_INDEX[id]];

/* ------------------------------------------------------------------ *
 * Books
 * ------------------------------------------------------------------ */

/** Small local quirks, so no two books in a town feel identical. */
const QUIRKS = [
  { id: 'plain', label: null, mods: {} },
  { id: 'newshops', label: 'A run of new shops', mods: { applicants: 1.3, risk: 1.1 } },
  { id: 'oldfamilies', label: 'Old families', mods: { risk: 0.85, noise: 0.9, loanSize: 1.2 } },
  { id: 'afterfire', label: 'After the fire', mods: { risk: 1.15, recovery: 0.8, applicants: 1.25 } },
  { id: 'railway', label: 'The railway came', mods: { applicants: 1.4, term: 1.3, loanSize: 1.3 } },
  { id: 'quiet', label: 'A quiet quarter', mods: { applicants: 0.8, volatility: 0.8 } },
  { id: 'shortmoney', label: 'Bills, not loans', mods: { term: 0.7, loanSize: 0.8, applicants: 1.45 } },
  { id: 'nobooks', label: 'Nobody keeps books', mods: { noise: 1.3, mispricing: 1.15 } },
];

const bookSeed = (townIdx, i) => (townIdx + 1) * 1_000_003 + (i + 1) * 7919;

/** The 25 books of a town, always generated the same way. */
export function booksFor(townId) {
  const townIdx = TOWN_INDEX[townId];
  const t = TOWNS[townIdx];
  const out = [];
  for (let i = 0; i < BOOKS_PER_TOWN; i++) {
    const rng = mulberry32(bookSeed(townIdx, i));
    const quirk = QUIRKS[Math.floor(rng() * QUIRKS.length)];
    const area = t.areas[Math.floor(rng() * t.areas.length)];
    const kind = rng() < 0.5 ? 'Book' : ['Ledger', 'Account', 'Paper', 'Bills'][Math.floor(rng() * 4)];
    out.push({
      index: i,
      townId,
      name: dedupeName(out, `The ${area} ${kind}`, i),
      tier: TIER_LAYOUT[i],
      quirk: quirk.label,
      seed: bookSeed(townIdx, i),
      mods: mergeMods(quirk.mods, { applicants: 0.9 + rng() * 0.3 }),
    });
  }
  return out;
}

/** Two books in a town sharing a name would be confusing on the list. */
function dedupeName(existing, name, i) {
  if (!existing.some((b) => b.name === name)) return name;
  return `${name} (${i + 1})`;
}

/** Everything here multiplies — there are no additive knobs on this book. */
export function mergeMods(...list) {
  const out = {};
  for (const mods of list) {
    for (const [key, value] of Object.entries(mods || {})) {
      out[key] = (out[key] ?? 1) * value;
    }
  }
  return out;
}

/** Everything sim.js needs to play one book. */
export function runConfigFor(townId, bookIndex) {
  const t = getTown(townId);
  const book = booksFor(townId)[bookIndex];
  const tier = TIERS[book.tier];
  return {
    seed: book.seed,
    weeks: tier.weeks,
    stake: tier.stake,
    mods: mergeMods(tier.mods, t.challenge.mods, book.mods),
    book: { townId, index: bookIndex, name: book.name, tier: book.tier },
  };
}

/**
 * The profit needed to hold a book: a share of what the best reference
 * underwriter clears there. Cached on the campaign so the bar never moves
 * under a player.
 */
export function targetFor(campaign, townId, bookIndex) {
  const key = `${townId}:${bookIndex}`;
  if (campaign?.targets?.[key] != null) return campaign.targets[key];
  const config = runConfigFor(townId, bookIndex);
  const tier = TIERS[booksFor(townId)[bookIndex].tier];
  const par = parProfit(config);
  const target = Math.max(5, Math.round(par * tier.parFactor));
  if (campaign) {
    campaign.targets = campaign.targets || {};
    campaign.targets[key] = target;
  }
  return target;
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

export function newCampaign() {
  return {
    version: 1,
    treasury: 0,
    held: {},        // townId → array of held book indexes
    targets: {},     // "townId:index" → the bar, cached once shown
    ops: null,       // built by ops.js once five towns are done
    stats: { runsPlayed: 0, runsWon: 0, loansWritten: 0 },
  };
}

export const heldIn = (campaign, townId) => campaign.held[townId] || [];
export const isHeld = (campaign, townId, i) => heldIn(campaign, townId).includes(i);
export const townDone = (campaign, townId) => heldIn(campaign, townId).length >= BOOKS_TO_TAKE_TOWN;

export function completedTowns(campaign) {
  return TOWNS.filter((t) => townDone(campaign, t.id)).map((t) => t.id);
}

/** Towns open two at a time, so there is always somewhere else to go. */
export function isTownUnlocked(campaign, townId) {
  return TOWN_INDEX[townId] <= completedTowns(campaign).length + 1;
}

/** Books are held in order, so the difficulty ramp holds. */
export function isBookUnlocked(campaign, townId, i) {
  if (!isTownUnlocked(campaign, townId)) return false;
  if (i === 0) return true;
  return isHeld(campaign, townId, i - 1);
}

/**
 * Is this town inside the free tier?
 *
 * Purely positional, and kept here with the rest of the progression rules
 * rather than in the shop: the campaign decides what the free tier *is*, and
 * the payments layer only decides whether it applies.
 */
export function isTownFree(townId, freeTowns) {
  return TOWN_INDEX[townId] < freeTowns;
}

export function nextBook(campaign, townId) {
  const held = heldIn(campaign, townId);
  for (let i = 0; i < BOOKS_PER_TOWN; i++) if (!held.includes(i)) return i;
  return null;
}

/** Record a held book. Returns what changed, for the celebration screen. */
export function holdBook(campaign, townId, i, profit, loansWritten = 0) {
  const before = townDone(campaign, townId);
  const list = campaign.held[townId] || (campaign.held[townId] = []);
  if (!list.includes(i)) list.push(i);
  list.sort((a, b) => a - b);
  campaign.treasury = Math.round((campaign.treasury + profit) * 100) / 100;
  campaign.stats.loansWritten += loansWritten;
  const townJustDone = !before && townDone(campaign, townId);
  const done = completedTowns(campaign).length;
  return {
    townJustDone,
    townsDone: done,
    opsJustUnlocked: townJustDone && done === TOWNS_FOR_OPS,
  };
}

export const opsUnlocked = (campaign) => completedTowns(campaign).length >= TOWNS_FOR_OPS;

export function campaignProgress(campaign) {
  const held = TOWNS.reduce((n, t) => n + heldIn(campaign, t.id).length, 0);
  return {
    books: held,
    totalBooks: TOWNS.length * BOOKS_PER_TOWN,
    towns: completedTowns(campaign).length,
    totalTowns: TOWNS.length,
  };
}

/* ------------------------------------------------------------------ *
 * Explaining a book
 * ------------------------------------------------------------------ */

const NEUTRAL = {
  applicants: 1, risk: 1, noise: 1, rateSpread: 1, loanSize: 1, term: 1,
  depositBase: 1, volatility: 1, skittish: 1, recovery: 1, overhead: 1, shockChance: 1,
};

/**
 * Turn merged modifiers into plain sentences. A player should be able to see
 * what a book will do to them before they take it on.
 */
export function describeMods(mods) {
  const m = { ...NEUTRAL, ...mods };
  const out = [];
  const pct = (v) => `${Math.round(Math.abs(v - 1) * 100)}%`;

  if (m.risk >= 1.2) out.push({ icon: '📉', text: `Bad country — ${pct(m.risk)} more of this town goes under.` });
  if (m.risk <= 0.85) out.push({ icon: '📗', text: 'Sound country — most of these people will pay you back.' });
  if (m.noise >= 1.35) out.push({ icon: '🌫️', text: 'The files tell you very little. Expect to be wrong more often.' });
  if (m.noise <= 0.9) out.push({ icon: '🔍', text: 'Clear files — what you read is close to the truth.' });
  if (m.rateSpread >= 1.3) out.push({ icon: '🎲', text: 'Rates here are all over the place, in both directions.' });
  if (m.rateSpread <= 0.8) out.push({ icon: '💸', text: `Thin spread — ${pct(m.rateSpread)} less interest for the same risk.` });
  if (m.recovery <= 0.8) out.push({ icon: '🪨', text: `Poor security — it covers ${pct(m.recovery)} less when a loan goes bad.` });
  if (m.loanSize >= 1.35) out.push({ icon: '💰', text: 'Large sums. One of these is a serious bite out of the safe.' });
  if (m.loanSize <= 0.75) out.push({ icon: '🪙', text: 'Small sums — quick to fund, slow to add up.' });
  if (m.term >= 1.35) out.push({ icon: '⏳', text: `Long money — it is out of your hands ${pct(m.term)} longer.` });
  if (m.term <= 0.8) out.push({ icon: '⚡', text: 'Short money — it comes back quickly.' });
  if (m.applicants >= 1.3) out.push({ icon: '📋', text: 'A long queue. You cannot fund everybody worth funding.' });
  if (m.applicants <= 0.75) out.push({ icon: '📄', text: 'Few callers. Turning one down is a week doing nothing.' });
  if (m.depositBase <= 0.8) out.push({ icon: '🏦', text: `Small deposit book — ${pct(m.depositBase)} less to lend on.` });
  if (m.volatility >= 1.4) out.push({ icon: '🌊', text: 'Restless deposits. What is in the safe on Monday may not be there on Friday.' });
  if (m.skittish >= 1.3) out.push({ icon: '😨', text: 'A nervous town — confidence goes fast and comes back slowly.' });
  if (m.shockChance >= 1.4) out.push({ icon: '🔔', text: 'Frights are common here.' });
  if (m.overhead >= 1.4) out.push({ icon: '🧾', text: `Costly to keep open — ${pct(m.overhead)} more a week before you earn a penny.` });
  return out;
}
