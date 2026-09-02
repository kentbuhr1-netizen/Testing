/**
 * The Round — the campaign.
 *
 * 25 towns, 25 neighbourhoods each. Neighbourhoods inside a town ramp through
 * four difficulty tiers; towns themselves each bend the rules in one
 * distinctive way. Hold all 25 and the town is yours.
 *
 * Targets are not hand-written. Every neighbourhood's bar comes from
 * `parProfit` — what the best of a family of reference routers clears on that
 * exact round, with that town's distances, weather and clients — scaled by
 * the tier. A sprawling round of fussy clients on a hillside therefore gets an
 * honestly lower bar than a tight terrace, without anyone balancing 625
 * numbers by hand.
 */
import { parProfit, mulberry32 } from './sim.js';

export const ROUNDS_PER_TOWN = 25;
/**
 * How much of a town you must hold before it counts as taken. Set to all 25;
 * lower it to shorten the campaign without touching anything else.
 */
export const ROUNDS_TO_TAKE_TOWN = ROUNDS_PER_TOWN;
export const TOWNS_FOR_OPS = 5;   // the yard unlocks once this many towns are done

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export const TIERS = {
  easy: {
    id: 'easy', label: 'Easy', icon: '🟢', days: 14, stake: 60, parFrom: 0.34, parTo: 0.50,
    blurb: 'Forgiving clients and a short season. Room to learn the round.',
    mods: { fussiness: 0.85 },
  },
  medium: {
    id: 'medium', label: 'Medium', icon: '🟡', days: 18, stake: 55, parFrom: 0.52, parTo: 0.68,
    blurb: 'A fair round. Every wasted mile is a lawn you did not get to.',
    mods: {},
  },
  hard: {
    id: 'hard', label: 'Hard', icon: '🟠', days: 22, stake: 50, parFrom: 0.70, parTo: 0.84,
    blurb: 'Sharp eyes on the finish, and the blade goes off fast.',
    mods: { fussiness: 1.15, dulling: 1.15 },
  },
  impossible: {
    id: 'impossible', label: 'Impossible', icon: '🔴', days: 26, stake: 45, parFrom: 0.86, parTo: 0.95,
    blurb: 'Every mile planned, every blade sharp, or you will be dropped.',
    mods: { fussiness: 1.35, dulling: 1.3, travel: 1.1 },
  },
};

/**
 * What share of par a round asks for.
 *
 * A flat share per tier put a wall at each boundary: simulated play cleared
 * Easy rounds at 151% of target and the very next round at 96%, and 61 of 100
 * players gave up on a Medium round. Each tier now ramps from its first round
 * to its last, so the ask climbs by a point or two a round across the whole
 * town instead of standing still and then jumping.
 */
export function parFactorFor(roundIndex) {
  const tier = TIERS[TIER_LAYOUT[roundIndex]];
  const inTier = TIER_LAYOUT.slice(0, roundIndex).filter((t) => t === tier.id).length;
  const of = TIER_LAYOUT.filter((t) => t === tier.id).length;
  return of < 2 ? tier.parTo : tier.parFrom + (tier.parTo - tier.parFrom) * (inTier / (of - 1));
}

/** Which tier each of a town's 25 neighbourhoods belongs to. */
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
  town('willowbrook', 'Willowbrook', 'Surrey', '🌳',
    { name: 'Easy Streets', blurb: 'Flat, tidy, and nobody is in a hurry. A good place to learn the trade.',
      mods: { fussiness: 0.8, travel: 0.9, spread: 0.85 } },
    ['Meadow', 'Brookside', 'The Larches', 'Parkview', 'Old Mill', 'Church End']),
  town('fairhaven', 'Fairhaven', 'Kent', '🏘️',
    { name: 'Terraces', blurb: 'Handkerchief lawns packed tight. Barely worth starting the van between them.',
      mods: { spread: 0.5, lawnSize: 0.6, rate: 0.85, clients: 1.3 } },
    ['Station', 'Albert', 'Victoria', 'Coronation', 'The Terrace', 'Mill Row']),
  town('oakridge', 'Oakridge', 'Hampshire', '🛣️',
    { name: 'Ribbon Development', blurb: 'Strung out along five miles of B-road. The driving is the job.',
      mods: { spread: 1.5, travel: 1.2, clients: 0.85, rate: 1.15 } },
    ['Ridgeway', 'Long Acre', 'The Drift', 'Beacon', 'Hill Top', 'Farthing']),
  town('sunnyvale', 'Sunnyvale', 'Essex', '☀️',
    { name: 'Baked Dry', blurb: 'The grass barely grows in August — and they still expect you to call.',
      mods: { growth: 0.65, fussiness: 1.1, rate: 1.05 } },
    ['Sunnyside', 'Orchard', 'Vineyard', 'The Suntrap', 'South Field', 'Warren']),
  town('rainford', 'Rainford', 'Lancashire', '🌧️',
    { name: 'It Always Rains', blurb: 'Half your days are washed out and the grass never stops.',
      mods: { wetBias: 2.0, growth: 1.3 } },
    ['Watery', 'The Brook', 'Marsh', 'Rain Hill', 'Weir', 'Fold']),
  town('steepleton', 'Steepleton', 'Derbyshire', '⛰️',
    { name: 'All Uphill', blurb: 'Every lawn is on a slope. The mower fights you the whole way.',
      mods: { slope: 1.35, travel: 1.2 } },
    ['Steep', 'Chapel Bank', 'High', 'Cliffe', 'The Rise', 'Crag']),
  town('sandmere', 'Sandmere', 'Norfolk', '🏖️',
    { name: 'Sand In Everything', blurb: 'Salt air and grit off the dunes. Blades go off in a morning.',
      mods: { dulling: 2.0, growth: 0.85, rate: 1.1 } },
    ['Dune', 'Shore', 'Sea View', 'The Strand', 'Harbour', 'Salt Marsh']),
  town('grandview', 'Grandview', 'Berkshire', '💷',
    { name: 'Money And Opinions', blurb: 'They pay properly and they inspect the edges.',
      mods: { rate: 1.5, fussiness: 1.5 } },
    ['The Avenue', 'Grange', 'Manor', 'Beeches', 'Hall', 'Coppice']),
  town('millbrook', 'Millbrook', 'Wiltshire', '🌾',
    { name: 'Big Gardens', blurb: 'Old houses with old lawns. One of these is half a day.',
      mods: { lawnSize: 1.7, clients: 0.7, rate: 1.2 } },
    ['Mill', 'Water Lane', 'Glebe', 'Tithe', 'The Paddock', 'Barn']),
  town('cedarfalls', 'Cedar Falls', 'Somerset', '🌱',
    { name: 'It Never Stops Growing', blurb: 'Rich soil and soft rain. Turn your back and it is a meadow.',
      mods: { growth: 1.6, wetBias: 1.3 } },
    ['Cedar', 'Falls', 'Green Vale', 'Springhead', 'Fern', 'Bramble']),
  town('northgate', 'Northgate', 'Yorkshire', '📋',
    { name: 'A Full Book', blurb: 'More work than anyone can service. Choosing is the whole job.',
      mods: { clients: 1.6, offerChance: 1.8, rate: 0.95 } },
    ['Northgate', 'Kirkgate', 'Eastfield', 'Moorside', 'The Wynd', 'Bar Lane']),
  town('thornbury', 'Thornbury', 'Gloucestershire', '🌂',
    { name: 'Wet And Watching', blurb: 'It rains, and then they tell you the finish is ragged.',
      mods: { wetBias: 1.7, fussiness: 1.35 } },
    ['Thorn', 'Hedge', 'Blackberry', 'The Butts', 'Rectory', 'Sheep Fair']),
  town('ashcombe', 'Ashcombe', 'Durham', '🪙',
    { name: 'Ten Pounds A Lawn', blurb: 'Plenty of work, none of it paying much. Volume or nothing.',
      mods: { rate: 0.7, clients: 1.5, spread: 0.85, fussiness: 0.9 } },
    ['Ash', 'Pit Row', 'Colliery', 'Fell View', 'The Crescent', 'Dene']),
  town('pinehurst', 'Pinehurst', 'Sussex', '🏡',
    { name: 'Estates', blurb: 'A handful of enormous places that pay like a week each.',
      mods: { lawnSize: 2.2, clients: 0.45, rate: 1.5, spread: 1.3 } },
    ['Pinehurst', 'The Chase', 'Wooded Hill', 'Lodge', 'Deer Park', 'Long Drive']),
  town('elmsworth', 'Elmsworth', 'Warwickshire', '🚧',
    { name: 'The One-Way System', blurb: 'Two hundred yards as the crow flies, twenty minutes in a van.',
      mods: { travel: 1.7, spread: 0.9 } },
    ['Elm', 'Gyratory', 'Ring Road', 'Bridge', 'Market', 'Cross Keys']),
  town('riverton', 'Riverton', 'Shropshire', '🌊',
    { name: 'Flood Plain', blurb: 'Soaking ground, explosive growth, and days you simply cannot work.',
      mods: { wetBias: 1.9, growth: 1.5, slope: 1.1 } },
    ['River', 'Ferry', 'The Holms', 'Watermead', 'Ford', 'Ait']),
  town('kingsmead', 'Kingsmead', 'Oxfordshire', '🧐',
    { name: 'Standards', blurb: 'They have had the same gardener for thirty years. You are on trial.',
      mods: { fussiness: 1.8, rate: 1.25 } },
    ['Kings', 'College', 'The Quad', 'Cloister', 'Warden', 'Provost']),
  town('barrowfield', 'Barrowfield', 'Lincolnshire', '🍂',
    { name: 'Poor Ground', blurb: 'Thin soil, thin grass, thin money. You will be driving a lot for a little.',
      mods: { growth: 0.6, rate: 0.75, spread: 1.25 } },
    ['Barrow', 'Fen', 'Drove', 'The Furlong', 'Wold', 'Clay Pit']),
  town('hollowick', 'Hollowick', 'Devon', '🗺️',
    { name: 'Lanes', blurb: 'Scattered across a hillside and joined by lanes a van barely fits down.',
      mods: { spread: 1.45, travel: 1.45, slope: 1.2 } },
    ['Hollow', 'Combe', 'The Lanes', 'Ford Cross', 'Beacon Hill', 'Linhay']),
  town('draycott', 'Draycott', 'Staffordshire', '⚙️',
    { name: 'Grit', blurb: 'Quarry dust on every verge. You will sharpen more than you mow.',
      mods: { dulling: 2.4, slope: 1.1, rate: 1.05 } },
    ['Quarry', 'Draycott', 'Kiln', 'Furnace', 'Slag Bank', 'Wharf']),
  town('verity', 'Verity Park', 'Cheshire', '🔍',
    { name: 'Close Neighbours', blurb: 'Packed in tight, and every one of them can see the others’ lawn.',
      mods: { spread: 0.6, clients: 1.4, fussiness: 1.5, lawnSize: 0.8 } },
    ['Verity', 'Park Gate', 'The Green', 'Laburnum', 'Sycamore Rise', 'Fold Yard']),
  town('longmarsh', 'Longmarsh', 'Suffolk', '🥾',
    { name: 'Wet And Scattered', blurb: 'Miles between them, and half of it under water by October.',
      mods: { spread: 1.5, wetBias: 1.7, travel: 1.2, growth: 1.2 } },
    ['Longmarsh', 'Staithe', 'The Levels', 'Reed', 'Causeway', 'Broad']),
  town('stonebridge', 'Stonebridge', 'Cumbria', '🪨',
    { name: 'Stone And Slope', blurb: 'Hillsides full of grit. Hard on the legs, harder on the blade.',
      mods: { slope: 1.4, dulling: 1.9, travel: 1.25 } },
    ['Stonebridge', 'Scar', 'Ghyll', 'The Fellside', 'Quarry Bank', 'Force']),
  town('wetherby', 'Wetherby Vale', 'Northumberland', '🌫️',
    { name: 'Everything, Slightly', blurb: 'Nothing here is terrible. All of it is against you.',
      mods: { wetBias: 1.35, slope: 1.2, dulling: 1.35, fussiness: 1.25, travel: 1.2, rate: 0.95 } },
    ['Wetherby', 'Vale', 'North Moor', 'Hexham Road', 'The Steads', 'Burn']),
  town('cranmoor', 'Cranmoor', 'Argyll', '🏔️',
    { name: 'The Worst Round In Britain', blurb: 'Sodden, vertical, gritty, scattered, and they still expect a stripe.',
      mods: { spread: 1.6, travel: 1.5, slope: 1.45, wetBias: 1.9, dulling: 1.8,
              fussiness: 1.5, growth: 1.3 } },
    ['Cranmoor', 'The Bealach', 'Loch Side', 'Glen', 'Corrie', 'Kyle']),
];

export const TOWN_INDEX = Object.fromEntries(TOWNS.map((t, i) => [t.id, i]));
export const getTown = (id) => TOWNS[TOWN_INDEX[id]];

/* ------------------------------------------------------------------ *
 * Neighbourhoods
 * ------------------------------------------------------------------ */

/** Small local quirks, so no two rounds in a town feel identical. */
const QUIRKS = [
  { id: 'plain', label: null, mods: {} },
  { id: 'culdesac', label: 'Cul-de-sacs', mods: { spread: 0.7, travel: 0.85 } },
  { id: 'ribbon', label: 'Strung out', mods: { spread: 1.35, travel: 1.15 } },
  { id: 'newbuild', label: 'New build', mods: { lawnSize: 0.65, rate: 0.9, fussiness: 1.15 } },
  { id: 'oldestate', label: 'Old estate', mods: { lawnSize: 1.5, rate: 1.15 } },
  { id: 'retirement', label: 'Retirement village', mods: { lawnSize: 0.6, fussiness: 1.3, clients: 1.25 } },
  { id: 'bythepark', label: 'Backing the park', mods: { growth: 1.3, dulling: 1.2 } },
  { id: 'industrial', label: 'Industrial edge', mods: { rate: 0.85, dulling: 1.4, clients: 1.15 } },
];

const roundSeed = (townIdx, i) => (townIdx + 1) * 1_000_003 + (i + 1) * 7919;

/** The 25 rounds of a town, always generated the same way. */
export function roundsFor(townId) {
  const townIdx = TOWN_INDEX[townId];
  const t = TOWNS[townIdx];
  const out = [];
  for (let i = 0; i < ROUNDS_PER_TOWN; i++) {
    const rng = mulberry32(roundSeed(townIdx, i));
    const quirk = QUIRKS[Math.floor(rng() * QUIRKS.length)];
    const area = t.areas[Math.floor(rng() * t.areas.length)];
    const kind = rng() < 0.5 ? 'Estate' : ['Rise', 'Park', 'Gardens', 'Fields', 'Green'][Math.floor(rng() * 5)];
    out.push({
      index: i,
      townId,
      name: dedupeName(out, `${area} ${kind}`, i),
      tier: TIER_LAYOUT[i],
      quirk: quirk.label,
      seed: roundSeed(townIdx, i),
      mods: mergeMods(quirk.mods, { clients: 0.9 + rng() * 0.3 }),
    });
  }
  return out;
}

/** Two rounds in a town sharing a name would be confusing on the map. */
function dedupeName(existing, name, i) {
  if (!existing.some((r) => r.name === name)) return name;
  return `${name} (${i + 1})`;
}

/** Everything here multiplies — there are no additive knobs on this round. */
export function mergeMods(...list) {
  const out = {};
  for (const mods of list) {
    for (const [key, value] of Object.entries(mods || {})) {
      out[key] = (out[key] ?? 1) * value;
    }
  }
  return out;
}

/** Everything sim.js needs to play one round. */
export function runConfigFor(townId, roundIndex) {
  const t = getTown(townId);
  const round = roundsFor(townId)[roundIndex];
  const tier = TIERS[round.tier];
  return {
    seed: round.seed,
    days: tier.days,
    stake: tier.stake,
    mods: mergeMods(tier.mods, t.challenge.mods, round.mods),
    neighbourhood: { townId, index: roundIndex, name: round.name, tier: round.tier },
  };
}

/**
 * The profit needed to hold a round: a share of what the best reference
 * router clears there. Cached on the campaign so the bar never moves under
 * a player.
 */
export function targetFor(campaign, townId, roundIndex) {
  const key = `${townId}:${roundIndex}`;
  if (campaign?.targets?.[key] != null) return campaign.targets[key];
  const config = runConfigFor(townId, roundIndex);
  const par = parProfit(config);
  const target = Math.max(10, Math.round(par * parFactorFor(roundIndex)));
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
    held: {},        // townId → array of held round indexes
    targets: {},     // "townId:index" → the bar, cached once shown
    ops: null,       // built by ops.js once five towns are done
    stats: { runsPlayed: 0, runsWon: 0, lawnsCut: 0 },
  };
}

export const heldIn = (campaign, townId) => campaign.held[townId] || [];
export const isHeld = (campaign, townId, i) => heldIn(campaign, townId).includes(i);
export const townDone = (campaign, townId) => heldIn(campaign, townId).length >= ROUNDS_TO_TAKE_TOWN;

export function completedTowns(campaign) {
  return TOWNS.filter((t) => townDone(campaign, t.id)).map((t) => t.id);
}

/** Towns open two at a time, so there is always somewhere else to go. */
export function isTownUnlocked(campaign, townId) {
  return TOWN_INDEX[townId] <= completedTowns(campaign).length + 1;
}

/** Rounds are held in order, so the difficulty ramp holds. */
export function isRoundUnlocked(campaign, townId, i) {
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

export function nextRound(campaign, townId) {
  const held = heldIn(campaign, townId);
  for (let i = 0; i < ROUNDS_PER_TOWN; i++) if (!held.includes(i)) return i;
  return null;
}

/** Record a held round. Returns what changed, for the celebration screen. */
export function holdRound(campaign, townId, i, profit, lawnsCut = 0) {
  const before = townDone(campaign, townId);
  const list = campaign.held[townId] || (campaign.held[townId] = []);
  if (!list.includes(i)) list.push(i);
  list.sort((a, b) => a - b);
  campaign.treasury = Math.round((campaign.treasury + profit) * 100) / 100;
  campaign.stats.lawnsCut += lawnsCut;
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
    rounds: held,
    totalRounds: TOWNS.length * ROUNDS_PER_TOWN,
    towns: completedTowns(campaign).length,
    totalTowns: TOWNS.length,
  };
}

/* ------------------------------------------------------------------ *
 * Explaining a round
 * ------------------------------------------------------------------ */

const NEUTRAL = {
  spread: 1, travel: 1, growth: 1, wetBias: 1, fussiness: 1, rate: 1,
  dulling: 1, slope: 1, clients: 1, offerChance: 1, lawnSize: 1,
};

/**
 * Turn merged modifiers into plain sentences. A player should be able to see
 * what a round will do to them before they take it on.
 */
export function describeMods(mods) {
  const m = { ...NEUTRAL, ...mods };
  const out = [];
  const pct = (v) => `${Math.round(Math.abs(v - 1) * 100)}%`;

  if (m.spread >= 1.25) out.push({ icon: '🗺️', text: `Scattered — the round is ${pct(m.spread)} more spread out.` });
  if (m.spread <= 0.8) out.push({ icon: '📍', text: `Tight round — everything is ${pct(m.spread)} closer together.` });
  if (m.travel >= 1.2) out.push({ icon: '🚐', text: `Slow going — driving takes ${pct(m.travel)} longer.` });
  if (m.travel <= 0.9) out.push({ icon: '🛣️', text: 'Easy roads — you get between jobs quickly.' });
  if (m.slope >= 1.2) out.push({ icon: '⛰️', text: `Sloping ground — mowing takes ${pct(m.slope)} longer.` });
  if (m.growth >= 1.25) out.push({ icon: '🌱', text: `Fast growth — lawns come due ${pct(m.growth)} sooner.` });
  if (m.growth <= 0.8) out.push({ icon: '🍂', text: `Slow growth — less billable work than it looks.` });
  if (m.wetBias >= 1.4) out.push({ icon: '🌧️', text: 'Wet climate — expect washed-out days and a poorer finish.' });
  if (m.fussiness >= 1.3) out.push({ icon: '🧐', text: 'Particular clients — a ragged finish will lose you the contract.' });
  if (m.fussiness <= 0.85) out.push({ icon: '🙂', text: 'Easy-going clients — they are glad you came.' });
  if (m.dulling >= 1.5) out.push({ icon: '🪚', text: `Hard on blades — they go blunt ${pct(m.dulling)} faster.` });
  if (m.rate >= 1.2) out.push({ icon: '💷', text: `Pays well — ${pct(m.rate)} more a visit.` });
  if (m.rate <= 0.85) out.push({ icon: '🪙', text: `Pays badly — ${pct(m.rate)} less a visit.` });
  if (m.lawnSize >= 1.35) out.push({ icon: '🌾', text: 'Big gardens. Each one eats the morning.' });
  if (m.lawnSize <= 0.75) out.push({ icon: '🔲', text: 'Small lawns — quick, but they hardly pay.' });
  if (m.clients >= 1.3) out.push({ icon: '📋', text: 'A long client list. You cannot get to everyone.' });
  if (m.clients <= 0.75) out.push({ icon: '📄', text: 'A short client list. Losing one really hurts.' });
  if (m.offerChance >= 1.5) out.push({ icon: '📞', text: 'New work keeps ringing in.' });
  return out;
}
