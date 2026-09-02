/**
 * Lemonade Stand — the campaign.
 *
 * 25 cities across the US and Europe, 25 street corners each. Corners inside a
 * city ramp through four difficulty tiers; cities themselves each bend the
 * rules in one distinctive way. Claim all 25 corners and the city is yours.
 *
 * Targets are not hand-written. Every corner's bar is derived from `parProfit`
 * — what a near-optimal player clears on that exact corner, with that city's
 * weather and prices — scaled by the tier. A drizzly city with fussy customers
 * therefore gets an honestly lower bar than a tourist trap, without anyone
 * balancing 625 numbers by hand.
 */
import { parProfit, mulberry32 } from './sim.js';
import { newBank } from './bank.js';
import { newStaff, hasMA } from './employees.js';

export const CORNERS_PER_CITY = 25;
/**
 * How much of a city you must claim before it counts as taken. Set to all 25
 * corners; lower it to shorten the campaign without touching anything else.
 */
export const CORNERS_TO_TAKE_CITY = CORNERS_PER_CITY;
export const CITIES_FOR_OPS = 5; // supply chain unlocks once this many cities are done

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export const TIERS = {
  easy: {
    id: 'easy', label: 'Easy', icon: '🟢', days: 6, stake: 30, parFactor: 0.4,
    blurb: 'A gentle corner. Room to experiment.',
    mods: { strictness: 0.8 },
  },
  medium: {
    id: 'medium', label: 'Medium', icon: '🟡', days: 7, stake: 25, parFactor: 0.62,
    blurb: 'Customers notice a bad batch.',
    mods: { strictness: 1.0 },
  },
  hard: {
    id: 'hard', label: 'Hard', icon: '🟠', days: 8, stake: 22, parFactor: 0.8,
    blurb: 'Thin capital, sharp palates, no slack.',
    mods: { strictness: 1.25, traffic: 0.95 },
  },
  impossible: {
    id: 'impossible', label: 'Impossible', icon: '🔴', days: 10, stake: 22, parFactor: 0.93,
    blurb: 'Near-perfect play, or nothing.',
    mods: { strictness: 1.5, traffic: 0.9, rent: 0.5 },
  },
};

/** Which tier each of a city's 25 corners belongs to. */
export const TIER_LAYOUT = [
  ...Array(7).fill('easy'),
  ...Array(7).fill('medium'),
  ...Array(7).fill('hard'),
  ...Array(4).fill('impossible'),
];

/* ------------------------------------------------------------------ *
 * Cities
 * ------------------------------------------------------------------ */

const city = (id, name, region, flag, challenge, streets, places) =>
  ({ id, name, region, flag, challenge, streets, places });

/**
 * Ordered easiest-feeling to harshest. `mods` are merged over the tier's own,
 * so a city bends every corner in it the same way.
 */
export const CITIES = [
  city('nyc', 'New York', 'US', '🗽',
    { name: 'Sidewalk Rush', blurb: 'Rivers of people — and a corner rent that bites whether you sell or not.',
      mods: { traffic: 1.5, rent: 2, lemonPrice: 1.15, sugarPrice: 1.15, cupPrice: 1.15 } },
    ['Canal', 'Mott', 'Bleecker', 'Lexington', 'Delancey', 'Broome'],
    ['Union Square', 'Bryant Park Gate', 'Grand Central Steps', 'Coney Boardwalk', 'High Line Stair']),
  city('austin', 'Austin', 'US', '🎸',
    { name: 'Live Music Crowds', blurb: 'Something is always happening downtown, and it is always warm.',
      mods: { eventChance: 1.8, tempShift: 7, traffic: 1.15 } },
    ['Rainey', 'Congress', 'Barton Springs', 'Guadalupe', 'Red River', 'Lamar'],
    ['Zilker Green', 'Festival Gate', 'Bat Bridge', 'Campus Drag', 'Food Truck Lot']),
  city('chicago', 'Chicago', 'US', '🌬️',
    { name: 'The Hawk', blurb: 'That wind off the lake keeps the temperature down and the crowds moving.',
      mods: { tempShift: -6, traffic: 1.1 } },
    ['Wabash', 'Clark', 'Halsted', 'Michigan', 'Damen', 'Milwaukee'],
    ['Navy Pier Gate', 'Millennium Park', 'Lakefront Path', 'Wrigley Corner', 'Riverwalk']),
  city('boston', 'Boston', 'US', '🎓',
    { name: 'Student Budgets', blurb: 'Packed pavements, empty pockets. Nobody here overpays for anything.',
      mods: { willingness: 0.85, traffic: 1.2 } },
    ['Boylston', 'Newbury', 'Tremont', 'Beacon', 'Comm Ave', 'Hanover'],
    ['Common Gate', 'Harvard Yard', 'Fenway Steps', 'Quincy Market', 'Esplanade']),
  city('miami', 'Miami', 'US', '🌴',
    { name: 'Storm Season', blurb: 'Blazing mornings, afternoon thunder. The sky decides your day.',
      mods: { wetBias: 2, hotBias: 1.6, tempShift: 8, eventChance: 1.3 } },
    ['Ocean', 'Collins', 'Brickell', 'Calle Ocho', 'Lincoln', 'Biscayne'],
    ['South Beach Walk', 'Marina Gate', 'Wynwood Wall', 'Bayfront', 'Pier Head']),
  city('la', 'Los Angeles', 'US', '🌞',
    { name: 'Sprawl', blurb: 'Nobody walks here — except when something is on, and then everybody does.',
      mods: { traffic: 0.85, eventChance: 1.6, tempShift: 4 } },
    ['Sunset', 'Melrose', 'Abbot Kinney', 'Fairfax', 'Ventura', 'Figueroa'],
    ['Venice Boardwalk', 'Griffith Trailhead', 'Studio Gate', 'Farmers Market', 'Pier Entrance']),
  city('nola', 'New Orleans', 'US', '🎺',
    { name: 'Festival City', blurb: 'Parades, second lines, brass bands. The street throws surprises daily.',
      mods: { eventChance: 2.2, tempShift: 6, wetBias: 1.4 } },
    ['Bourbon', 'Frenchmen', 'Magazine', 'Decatur', 'Royal', 'Canal'],
    ['Jackson Square', 'Riverwalk', 'Garden Gate', 'Streetcar Stop', 'Levee Path']),
  city('denver', 'Denver', 'US', '⛰️',
    { name: 'Mile High & Dry', blurb: 'Thin dry air makes everyone thirsty, and cool nights keep the crowds thin.',
      mods: { tempShift: -3, strictness: 1.15, iceExtra: 1, traffic: 0.95 } },
    ['Larimer', 'Colfax', 'Blake', 'Tennyson', 'Broadway', 'Pearl'],
    ['Union Station', 'Park Trailhead', 'Stadium Gate', 'Botanic Entrance', 'Creek Path']),
  city('barcelona', 'Barcelona', 'EU', '🇪🇸',
    { name: 'Siesta Hours', blurb: 'Half the day the street is empty. The other half it is scorching.',
      mods: { traffic: 0.8, tempShift: 8, willingness: 1.1 } },
    ['Rambla', 'Gràcia', 'Diagonal', 'Born', 'Poblenou', 'Raval'],
    ['Barceloneta Sand', 'Park Güell Gate', 'Sagrada Queue', 'Port Vell', 'Market Door']),
  city('lisbon', 'Lisbon', 'EU', '🇵🇹',
    { name: 'Hill Climb', blurb: 'Everything is uphill. Fewer feet get to you, but they arrive parched.',
      mods: { traffic: 0.85, tempShift: 6, willingness: 1.15 } },
    ['Alfama', 'Chiado', 'Bairro Alto', 'Baixa', 'Belém', 'Graça'],
    ['Tram 28 Stop', 'Miradouro', 'Castle Gate', 'Riverside Walk', 'Market Hall']),
  city('rome', 'Rome', 'EU', '🇮🇹',
    { name: 'Tourist Season', blurb: 'Enormous crowds, ruinous pitch fees, and suppliers who know it.',
      mods: { traffic: 1.4, rent: 2.5, lemonPrice: 1.2, sugarPrice: 1.2, icePrice: 1.2, cupPrice: 1.2 } },
    ['Corso', 'Trastevere', 'Veneto', 'Nazionale', 'Cavour', 'Appia'],
    ['Colosseum Gate', 'Trevi Steps', 'Pantheon Square', 'Villa Gardens', 'Spanish Steps']),
  city('amsterdam', 'Amsterdam', 'EU', '🚲',
    { name: 'Everyone Is Cycling', blurb: 'Plenty of traffic, but they are all moving. Only a bargain stops a bike.',
      mods: { traffic: 1.3, willingness: 0.8 } },
    ['Prinsengracht', 'Jordaan', 'Damrak', 'Utrechtsestraat', 'Kinkerstraat', 'Haarlemmerdijk'],
    ['Vondelpark Gate', 'Canal Bridge', 'Museum Square', 'Ferry Landing', 'Market Row']),
  city('berlin', 'Berlin', 'EU', '🇩🇪',
    { name: 'Cheap And Cheerful', blurb: 'Supplies cost little, and nobody will pay much. Volume is the whole game.',
      mods: { lemonPrice: 0.8, sugarPrice: 0.8, icePrice: 0.8, cupPrice: 0.8, willingness: 0.8, traffic: 1.15 } },
    ['Kastanienallee', 'Sonnenallee', 'Karl-Marx', 'Torstraße', 'Bergmann', 'Warschauer'],
    ['Mauerpark', 'Tempelhof Field', 'Museum Island', 'Canal Steps', 'Flea Market']),
  city('dublin', 'Dublin', 'EU', '🇮🇪',
    { name: 'Loyal Locals', blurb: 'Word travels fast in both directions. Your reputation moves twice as quickly.',
      mods: { repSwing: 1.6, wetBias: 1.8, tempShift: -5 } },
    ['Grafton', 'Camden', 'Dame', 'Capel', 'Thomas', 'Baggot'],
    ['Stephens Green', 'Ha\'penny Bridge', 'Docklands', 'Phoenix Gate', 'Temple Bar']),
  city('london', 'London', 'EU', '🇬🇧',
    { name: 'Grey Skies', blurb: 'Huge footfall under permanent cloud. Hot days are rare and precious.',
      mods: { wetBias: 2.2, hotBias: 0.6, tempShift: -6, traffic: 1.25 } },
    ['Brick Lane', 'Portobello', 'Oxford', 'Borough', 'Camden High', 'Shoreditch'],
    ['South Bank', 'Hyde Park Gate', 'Tube Exit', 'Market Arch', 'Bridge Steps']),
  city('prague', 'Prague', 'EU', '🇨🇿',
    { name: 'Bargain Hunters', blurb: 'Cheap supplies, cheap expectations. Margins are measured in coins.',
      mods: { lemonPrice: 0.75, sugarPrice: 0.75, icePrice: 0.75, cupPrice: 0.75, willingness: 0.75, traffic: 1.2 } },
    ['Karlova', 'Nerudova', 'Vinohradská', 'Dlouhá', 'Ječná', 'Křižíkova'],
    ['Charles Bridge', 'Old Town Square', 'Castle Steps', 'Riverbank', 'Tram Stop']),
  city('sf', 'San Francisco', 'US', '🌁',
    { name: 'Fog And Money', blurb: 'It never gets hot, but the people who do stop will pay almost anything.',
      mods: { tempShift: -10, hotBias: 0.4, willingness: 1.35 } },
    ['Valencia', 'Haight', 'Columbus', 'Fillmore', 'Irving', 'Castro'],
    ['Ferry Building', 'Dolores Park', 'Pier 39', 'Bridge Overlook', 'Cable Car Stop']),
  city('phoenix', 'Phoenix', 'US', '🔥',
    { name: 'Furnace', blurb: 'Brutal heat. Ice vanishes from the cup, and the ice man knows what he has.',
      mods: { tempShift: 18, iceExtra: 2, icePrice: 1.5 } },
    ['Mill', 'Roosevelt', 'Camelback', 'Van Buren', 'Grand', 'Central'],
    ['Desert Trailhead', 'Ballpark Gate', 'Canal Path', 'Civic Plaza', 'Shade Awning']),
  city('seattle', 'Seattle', 'US', '☔',
    { name: 'Perpetual Drizzle', blurb: 'It rains. Then it rains. Sunny days are worth a fortune here.',
      mods: { wetBias: 2.2, hotBias: 0.6, tempShift: -4, willingness: 1.15 } },
    ['Pike', 'Ballard', 'Capitol', 'Alaskan', 'Fremont', 'Denny'],
    ['Market Stall', 'Ferry Dock', 'Space Needle Lawn', 'Waterfront', 'Campus Path']),
  city('athens', 'Athens', 'EU', '🏛️',
    { name: 'Bone Dry', blurb: 'Relentless sun and ice priced like a luxury good.',
      mods: { tempShift: 12, icePrice: 2.0, iceExtra: 1 } },
    ['Ermou', 'Plaka', 'Monastiraki', 'Kolonaki', 'Psiri', 'Syntagma'],
    ['Acropolis Path', 'Agora Gate', 'Metro Exit', 'Lycabettus Foot', 'Port Road']),
  city('vegas', 'Las Vegas', 'US', '🎰',
    { name: 'Tourist Trap', blurb: 'They will pay anything — and so will you, for everything.',
      mods: { tempShift: 14, willingness: 1.4, rent: 3,
              lemonPrice: 1.35, sugarPrice: 1.35, icePrice: 1.35, cupPrice: 1.35 } },
    ['Fremont', 'Paradise', 'Flamingo', 'Tropicana', 'Sahara', 'Koval'],
    ['Strip Sidewalk', 'Fountain View', 'Casino Doors', 'Convention Gate', 'Pool Deck']),
  city('stockholm', 'Stockholm', 'EU', '🇸🇪',
    { name: 'Expensive Everything', blurb: 'Supplies cost a fortune. Happily, so does everything else here.',
      mods: { lemonPrice: 1.5, sugarPrice: 1.5, icePrice: 1.5, cupPrice: 1.5, willingness: 1.35, tempShift: -6 } },
    ['Drottninggatan', 'Götgatan', 'Hornsgatan', 'Odengatan', 'Sveavägen', 'Kungsgatan'],
    ['Gamla Stan', 'Ferry Quay', 'Djurgården Gate', 'Metro Steps', 'Harbour Walk']),
  city('paris', 'Paris', 'EU', '🇫🇷',
    { name: 'Discerning Palates', blurb: 'They will pay well for something excellent, and nothing at all for less.',
      mods: { strictness: 1.6, willingness: 1.2, rent: 1.5 } },
    ['Rivoli', 'Montmartre', 'Saint-Germain', 'Belleville', 'Marais', 'Bastille'],
    ['Seine Quay', 'Louvre Court', 'Luxembourg Gate', 'Métro Exit', 'Canal Bank']),
  city('vienna', 'Vienna', 'EU', '🎻',
    { name: 'Refined Taste', blurb: 'A city of coffee houses. An unbalanced glass is an insult here.',
      mods: { strictness: 1.8, willingness: 1.25 } },
    ['Kärntner', 'Mariahilfer', 'Ringstraße', 'Naschmarkt', 'Praterstraße', 'Graben'],
    ['Opera Steps', 'Prater Gate', 'Palace Garden', 'Danube Path', 'Museum Court']),
  city('reykjavik', 'Reykjavík', 'EU', '🇮🇸',
    { name: 'Sub-Arctic', blurb: 'Cold, wet, and nearly empty — but you are the only stand for a thousand miles.',
      mods: { tempShift: -13, hotBias: 0.3, wetBias: 1.6, willingness: 1.55, traffic: 0.85 } },
    ['Laugavegur', 'Skólavörðustígur', 'Hverfisgata', 'Bankastræti', 'Ægisgata', 'Frakkastígur'],
    ['Harpa Steps', 'Harbour Front', 'Hallgrímskirkja', 'Pool Entrance', 'Geyser Road']),
];

export const CITY_INDEX = Object.fromEntries(CITIES.map((c, i) => [c.id, i]));
export const getCity = (id) => CITIES[CITY_INDEX[id]];

/* ------------------------------------------------------------------ *
 * Corners
 * ------------------------------------------------------------------ */

/** Small local quirks, so no two corners in a city feel identical. */
const QUIRKS = [
  { id: 'plain',  label: null, mods: {} },
  { id: 'shade',  label: 'Shady spot', mods: { iceExtra: -1, traffic: 0.95 } },
  { id: 'suntrap',label: 'Sun trap', mods: { tempShift: 4, iceExtra: 1 } },
  { id: 'busy',   label: 'Busy crossing', mods: { traffic: 1.25, willingness: 0.95 } },
  { id: 'quiet',  label: 'Quiet street', mods: { traffic: 0.75, willingness: 1.15 } },
  { id: 'posh',   label: 'Smart neighbourhood', mods: { willingness: 1.2, rent: 0.75 } },
  { id: 'transit',label: 'Beside the station', mods: { traffic: 1.35, strictness: 1.1 } },
  { id: 'park',   label: 'Park entrance', mods: { traffic: 1.1, hotBias: 1.2 } },
];

const cornerSeed = (cityIdx, i) => (cityIdx + 1) * 1_000_003 + (i + 1) * 7919;

/** The 25 corners of a city, always generated the same way. */
export function cornersFor(cityId) {
  const cityIdx = CITY_INDEX[cityId];
  const c = CITIES[cityIdx];
  const out = [];
  for (let i = 0; i < CORNERS_PER_CITY; i++) {
    const rng = mulberry32(cornerSeed(cityIdx, i));
    const tier = TIER_LAYOUT[i];
    // Later corners in a tier lean on the quirkier pitches.
    const quirk = QUIRKS[Math.floor(rng() * QUIRKS.length)];
    const usePlace = rng() < 0.4;
    const name = usePlace
      ? c.places[Math.floor(rng() * c.places.length)]
      : `${c.streets[Math.floor(rng() * c.streets.length)]} & ${c.streets[Math.floor(rng() * c.streets.length)]}`;
    const traffic = 0.85 + rng() * 0.4;
    out.push({
      index: i,
      cityId,
      name: dedupeName(out, name, i),
      tier,
      quirk: quirk.label,
      seed: cornerSeed(cityIdx, i),
      mods: mergeMods(quirk.mods, { traffic }),
    });
  }
  return out;
}

/** Two corners in a city sharing a name would be confusing on the map. */
function dedupeName(existing, name, i) {
  if (!existing.some((c) => c.name === name)) return name;
  return `${name} (${i + 1})`;
}

/** Multipliers multiply, shifts add. */
export function mergeMods(...list) {
  const out = {};
  const additive = new Set(['tempShift', 'iceExtra', 'rent']);
  for (const mods of list) {
    for (const [key, value] of Object.entries(mods || {})) {
      if (additive.has(key)) out[key] = (out[key] ?? 0) + value;
      else out[key] = (out[key] ?? 1) * value;
    }
  }
  return out;
}

/** Everything sim.js needs to play one corner. */
export function runConfigFor(cityId, cornerIndex) {
  const c = getCity(cityId);
  const corner = cornersFor(cityId)[cornerIndex];
  const tier = TIERS[corner.tier];
  return {
    seed: corner.seed,
    days: tier.days,
    stake: tier.stake,
    mods: mergeMods(tier.mods, c.challenge.mods, corner.mods),
    corner: { cityId, index: cornerIndex, name: corner.name, tier: corner.tier },
  };
}

/**
 * The profit needed to claim a corner: a share of what near-perfect play
 * clears there. Cached on the campaign so the bar never moves under a player.
 */
export function targetFor(campaign, cityId, cornerIndex) {
  const key = `${cityId}:${cornerIndex}`;
  if (campaign?.targets?.[key] != null) return campaign.targets[key];
  const config = runConfigFor(cityId, cornerIndex);
  const tier = TIERS[cornersFor(cityId)[cornerIndex].tier];
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
    version: 2,
    treasury: 0,
    claimed: {},   // cityId → array of claimed corner indexes
    targets: {},   // "cityId:index" → the bar, cached once shown
    ops: null,     // built by ops.js once five cities are done
    bank: newBank(),
    employees: newStaff(),
    stats: { runsPlayed: 0, runsWon: 0, cupsSold: 0 },
  };
}

export const claimedIn = (campaign, cityId) => campaign.claimed[cityId] || [];
export const isClaimed = (campaign, cityId, i) => claimedIn(campaign, cityId).includes(i);
export const cityDone = (campaign, cityId) => claimedIn(campaign, cityId).length >= CORNERS_TO_TAKE_CITY;

export function completedCities(campaign) {
  return CITIES.filter((c) => cityDone(campaign, c.id)).map((c) => c.id);
}

/**
 * Is this city inside the free tier?
 *
 * Purely positional, and kept here with the rest of the progression rules
 * rather than in the shop: the campaign decides what the free tier *is*, and
 * the payments layer only decides whether it applies.
 */
export function isCityFree(cityId, freeCities) {
  return CITY_INDEX[cityId] < freeCities;
}

/** Cities open up two at a time, so there is always somewhere else to go. */
export function isCityUnlocked(campaign, cityId) {
  return CITY_INDEX[cityId] <= completedCities(campaign).length + 1;
}

/** Corners are claimed in order, so the difficulty ramp holds. */
export function isCornerUnlocked(campaign, cityId, i) {
  if (!isCityUnlocked(campaign, cityId)) return false;
  if (i === 0) return true;
  return isClaimed(campaign, cityId, i - 1);
}

export function nextCorner(campaign, cityId) {
  const claimed = claimedIn(campaign, cityId);
  for (let i = 0; i < CORNERS_PER_CITY; i++) if (!claimed.includes(i)) return i;
  return null;
}

/** Record a won corner. Returns what changed, for the celebration screen. */
export function claimCorner(campaign, cityId, i, profit) {
  const before = cityDone(campaign, cityId);
  const list = campaign.claimed[cityId] || (campaign.claimed[cityId] = []);
  if (!list.includes(i)) list.push(i);
  list.sort((a, b) => a - b);
  campaign.treasury = Math.round((campaign.treasury + profit) * 100) / 100;
  const cityJustDone = !before && cityDone(campaign, cityId);
  const done = completedCities(campaign).length;
  return {
    cityJustDone,
    citiesDone: done,
    opsJustUnlocked: cityJustDone && done === CITIES_FOR_OPS,
  };
}

export const opsUnlocked = (campaign) => completedCities(campaign).length >= CITIES_FOR_OPS;

/* ------------------------------------------------------------------ *
 * M&A — buying a corner instead of playing it
 * ------------------------------------------------------------------ */

/** A stiff premium over playing it yourself — this is a shortcut, not a bargain. */
export function acquisitionCost(campaign, cityId, cornerIndex) {
  return Math.round(targetFor(campaign, cityId, cornerIndex) * 3 * 100) / 100;
}

/** Claims a corner outright for cash, via the M&A specialist. No operating profit — you didn't earn it, you bought it. */
export function acquireCorner(campaign, cityId, cornerIndex) {
  if (!hasMA(campaign)) return { ok: false, why: 'Hire an M&A Specialist first.' };
  if (!isCornerUnlocked(campaign, cityId, cornerIndex)) return { ok: false, why: 'That corner is not open yet.' };
  if (isClaimed(campaign, cityId, cornerIndex)) return { ok: false, why: 'Already yours.' };
  const cost = acquisitionCost(campaign, cityId, cornerIndex);
  if (campaign.treasury < cost) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = Math.round((campaign.treasury - cost) * 100) / 100;
  return { ok: true, ...claimCorner(campaign, cityId, cornerIndex, 0) };
}

export function campaignProgress(campaign) {
  const claimed = CITIES.reduce((n, c) => n + claimedIn(campaign, c.id).length, 0);
  return {
    corners: claimed,
    totalCorners: CITIES.length * CORNERS_PER_CITY,
    cities: completedCities(campaign).length,
    totalCities: CITIES.length,
  };
}

/* ------------------------------------------------------------------ *
 * Explaining a corner
 * ------------------------------------------------------------------ */

/**
 * Turn merged modifiers into plain sentences. A player should be able to see
 * what a corner will do to them before they put money on it.
 */
export function describeMods(mods) {
  const m = { ...NEUTRAL, ...mods };
  const out = [];
  const pct = (v) => `${Math.round(Math.abs(v - 1) * 100)}%`;

  if (m.tempShift >= 4) out.push({ icon: '🔥', text: `Runs hot — about ${Math.round(m.tempShift)}°F warmer than usual.` });
  if (m.tempShift <= -4) out.push({ icon: '🧊', text: `Runs cold — about ${Math.round(-m.tempShift)}°F cooler than usual.` });
  if (m.traffic >= 1.15) out.push({ icon: '👣', text: `Busy pitch — ${pct(m.traffic)} more people walk past.` });
  if (m.traffic <= 0.9) out.push({ icon: '🚶', text: `Quiet pitch — ${pct(m.traffic)} fewer people walk past.` });
  if (m.willingness >= 1.15) out.push({ icon: '💰', text: `Deep pockets — they will pay ${pct(m.willingness)} more.` });
  if (m.willingness <= 0.9) out.push({ icon: '🪙', text: `Tight wallets — they will pay ${pct(m.willingness)} less.` });
  if (m.strictness >= 1.2) out.push({ icon: '🧐', text: 'Fussy palates — a mediocre glass will not do.' });
  if (m.strictness <= 0.85) out.push({ icon: '🙂', text: 'Forgiving crowd — they drink what you pour.' });
  if (m.wetBias >= 1.5) out.push({ icon: '🌧️', text: 'Wet climate — expect rain to shut the street.' });
  if (m.hotBias <= 0.7) out.push({ icon: '☁️', text: 'Hot days are rare here.' });
  if (m.hotBias >= 1.3) out.push({ icon: '☀️', text: 'Long stretches of heat.' });
  if (m.iceExtra >= 1) out.push({ icon: '🥤', text: `Ice vanishes fast — cups need about ${m.iceExtra} more.` });
  if (m.iceExtra <= -1) out.push({ icon: '🌳', text: 'Shaded — cups need a little less ice.' });
  if (m.icePrice >= 1.3) out.push({ icon: '💸', text: `Ice costs ${pct(m.icePrice)} more here.` });
  if (m.lemonPrice >= 1.15) out.push({ icon: '🛒', text: 'Supplies are expensive in this city.' });
  if (m.lemonPrice <= 0.85) out.push({ icon: '🛒', text: 'Supplies are cheap in this city.' });
  if (m.rent > 0) out.push({ icon: '🏠', text: `Pitch fee of ${'$' + m.rent.toFixed(2)} a day, rain or shine.` });
  if (m.eventChance >= 1.5) out.push({ icon: '🎪', text: 'Something is always happening on this street.' });
  if (m.repSwing >= 1.4) out.push({ icon: '🗣️', text: 'Word travels fast — reputation moves quickly here.' });
  return out;
}

const NEUTRAL = {
  traffic: 1, willingness: 1, tempShift: 0, hotBias: 1, wetBias: 1, eventChance: 1,
  strictness: 1, iceExtra: 0, rent: 0, repSwing: 1,
  lemonPrice: 1, sugarPrice: 1, icePrice: 1, cupPrice: 1,
};
