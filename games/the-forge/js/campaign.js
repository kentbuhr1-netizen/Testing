/**
 * The Forge — the campaign.
 *
 * 25 cities, 25 workshops each. Workshops inside a city ramp through four
 * difficulty tiers; the cities themselves each bend the rules in one
 * distinctive way. Hold all 25 workshops and the city is yours.
 *
 * Targets are not hand-written. Every workshop's bar is derived from
 * `parPieces` — the pieces the best of a family of reference doctrines
 * delivers at that exact workshop, with that city's coal, wages and weather —
 * scaled by the tier. Meteoric iron in a cold shop with no money therefore
 * gets an honestly lower bar than mild steel in Sheffield, without anyone
 * balancing 625 numbers by hand.
 */
import { parPieces, mulberry32, ALLOYS } from './sim.js';

export const WORKSHOPS_PER_CITY = 25;
/**
 * How much of a city you must hold before it counts as taken. Set to all 25
 * workshops; lower it to shorten the campaign without touching anything else.
 */
export const WORKSHOPS_TO_TAKE_CITY = WORKSHOPS_PER_CITY;
export const CITIES_FOR_GUILD = 5;   // the guild opens once this many cities are done

/** Pieces delivered convert into guild capital, in £. */
export const CAPITAL_PER_PIECE = 0.35;

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export const TIERS = {
  easy: {
    id: 'easy', label: 'Easy', icon: '🟢', shifts: 8, purse: 14, retainer: 3.0, parFactor: 0.4,
    blurb: 'A short commission, a full purse, and time to learn what the metal wants.',
    mods: { coal: 1.1, pride: 1.15 },
  },
  medium: {
    id: 'medium', label: 'Medium', icon: '🟡', shifts: 10, purse: 11, retainer: 2.4, parFactor: 0.62,
    blurb: 'A fair job of work. Every shift spent guessing is a shift you do not get back.',
    mods: {},
  },
  hard: {
    id: 'hard', label: 'Hard', icon: '🟠', shifts: 13, purse: 9, retainer: 2.0, parFactor: 0.8,
    blurb: 'Thin money, tired hands, and tooling that will not stay true.',
    mods: { fatigue: 1.15, wear: 1.2 },
  },
  impossible: {
    id: 'impossible', label: 'Impossible', icon: '🔴', shifts: 16, purse: 8, retainer: 1.8, parFactor: 0.93,
    blurb: 'Find the heat on the first shift, or spend a fortnight making scrap.',
    mods: { fatigue: 1.3, wear: 1.35, pride: 0.85 },
  },
};

/** Which tier each of a city's 25 workshops belongs to. */
export const TIER_LAYOUT = [
  ...Array(7).fill('easy'),
  ...Array(7).fill('medium'),
  ...Array(7).fill('hard'),
  ...Array(4).fill('impossible'),
];

/* ------------------------------------------------------------------ *
 * Cities
 * ------------------------------------------------------------------ */

const city = (id, name, country, flag, challenge, quarters, places) =>
  ({ id, name, country, flag, challenge, quarters, places });

/**
 * Ordered gentlest-feeling to harshest. `mods` are merged over the tier's own,
 * so a city bends every workshop in it the same way.
 *
 * Difficulty here is a smith's difficulty, not an economist's: the coke, the
 * cold, the wages, the tooling and what a finished piece will fetch at the end
 * of the street. Cheap labour is a real advantage, and several of the
 * hardest-looking cities have it.
 */
export const CITIES = [
  city('sheffield', 'Sheffield', 'England', '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    { name: 'Crucible City', blurb: 'The coke seam runs under the shop floor. Nowhere else is heat this cheap.',
      mods: { coal: 1.3, skill: 1.15, demand: 1.05 } },
    ['Attercliffe', 'Neepsend', 'Kelham', 'Darnall', 'Brightside', 'Millsands'],
    ['Wheel Yard', 'Cutlers’ Row', 'Canal Basin', 'Tilt Hammer', 'Grinders’ Hull']),
  city('solingen', 'Solingen', 'Germany', '🇩🇪',
    { name: 'The City of Blades', blurb: 'Six hundred years of tool rooms. Nothing here ever goes out of true.',
      mods: { wear: 0.6, skill: 1.2, demand: 1.1 } },
    ['Ohligs', 'Gräfrath', 'Wald', 'Höhscheid', 'Burg', 'Merscheid'],
    ['Wupper Wheel', 'Blade Row', 'Grinding Cottage', 'Castle Ford', 'Temper Shed']),
  city('seki', 'Seki', 'Japan', '🇯🇵',
    { name: 'Eight Hundred Years', blurb: 'The shop takes a pride in its work that money cannot buy and fatigue cannot touch.',
      mods: { pride: 1.5, fatigue: 0.75, skill: 1.15 } },
    ['Honmachi', 'Zaimoku', 'Kodera', 'Mukaimachi', 'Hosokawa', 'Nagaragawa'],
    ['River Sand Bed', 'Shrine Steps', 'Charcoal Yard', 'Water Wheel', 'Polishing House']),
  city('toledo', 'Toledo', 'Spain', '🇪🇸',
    { name: 'Water And Sand', blurb: 'A name on a blade is worth more here than the blade. Stock is cheap and buyers are not.',
      mods: { demand: 1.3, iron: 0.85 } },
    ['Zocodover', 'Santa Bárbara', 'Antequeruela', 'Covachuelas', 'Azucaica', 'Palomarejos'],
    ['Tagus Ford', 'Alcázar Wall', 'Armoury Gate', 'Bridge Forge', 'Sword Row']),
  city('eskilstuna', 'Eskilstuna', 'Sweden', '🇸🇪',
    { name: 'The Free Town Of Smiths', blurb: 'A crown charter, a full treasury and a winter that eats coke.',
      mods: { funding: 1.4, wage: 0.85, chill: 1.25 } },
    ['Rademachern', 'Nyfors', 'Fristaden', 'Torshälla', 'Munktellstaden', 'Skiftinge'],
    ['Forge Row', 'River Sluice', 'Charcoal Store', 'Guild Hall', 'Iron Quay']),
  city('thiers', 'Thiers', 'France', '🇫🇷',
    { name: 'The Knife Valley', blurb: 'Small shops on a steep river, and every hand in the valley has done this since childhood.',
      mods: { skill: 1.3, shopScale: 0.75, demand: 1.2 } },
    ['Durolle', 'Le Moutier', 'Bellevue', 'Les Limandons', 'Saint-Jean', 'Rochedane'],
    ['Water Stair', 'Cutlers’ Bridge', 'Grinding Loft', 'Gorge Path', 'Blade Market']),
  city('brescia', 'Brescia', 'Italy', '🇮🇹',
    { name: 'The Armoury Of Lombardy', blurb: 'Everything sells and everything wears out. Buyers here have never once haggled.',
      mods: { demand: 1.35, wear: 1.3, shopScale: 1.2 } },
    ['Carmine', 'San Faustino', 'Urago', 'Mompiano', 'Fiumicello', 'Sanpolino'],
    ['Armourers’ Court', 'Mella Wheel', 'Castle Forge', 'Foundry Lane', 'Plate Yard']),
  city('liege', 'Liège', 'Belgium', '🇧🇪',
    { name: 'Coal Under The Streets', blurb: 'Fuel is nearly free and the men who dig it want paying properly.',
      mods: { coal: 1.35, wage: 1.25, chill: 1.15 } },
    ['Outremeuse', 'Sainte-Marguerite', 'Herstal', 'Seraing', 'Grivegnée', 'Saint-Léonard'],
    ['Meuse Quay', 'Pit Head', 'Barrel Row', 'Blast Yard', 'Coking Ovens']),
  city('bilbao', 'Bilbao', 'Spain', '🇪🇸',
    { name: 'Iron From The Hill', blurb: 'The ore is in the hill behind the shop. Stock costs almost nothing and fetches almost nothing.',
      mods: { iron: 0.55, demand: 0.85, shopScale: 1.15 } },
    ['Bilbao la Vieja', 'Deusto', 'Santutxu', 'Basurto', 'Zorrotza', 'Begoña'],
    ['Ore Wharf', 'Nervión Bend', 'Bessemer Shed', 'Ría Crane', 'Slag Bank']),
  city('pittsburgh', 'Pittsburgh', 'United States', '🇺🇸',
    { name: 'The Mills', blurb: 'Enormous shops, enormous money, and a pace that burns men out by forty.',
      mods: { shopScale: 1.5, funding: 1.25, fatigue: 1.3, demand: 0.9 } },
    ['Homestead', 'Braddock', 'Lawrenceville', 'Hazelwood', 'Duquesne', 'Aliquippa'],
    ['Open Hearth', 'River Landing', 'Rolling Shed', 'Rail Spur', 'Blast Row']),
  city('ferlach', 'Ferlach', 'Austria', '🇦🇹',
    { name: 'Gunsmiths’ Town', blurb: 'Work measured in thousandths. Tiny shops, exacting buyers, and no margin for a bad heat.',
      mods: { wear: 0.7, demand: 1.4, shopScale: 0.7, funding: 0.85 } },
    ['Unterferlach', 'Glainach', 'Kirschentheuer', 'Loibltal', 'Windisch Bleiberg', 'Strugarjach'],
    ['Barrel Bench', 'Drava Ford', 'Stocking Loft', 'Proof House', 'Engraver’s Room']),
  city('ostrava', 'Ostrava', 'Czechia', '🇨🇿',
    { name: 'The Steel Heart', blurb: 'Coke by the mountain and wages by the hour, and nobody pays much for what comes out.',
      mods: { coal: 1.25, fatigue: 1.3, wage: 0.75, demand: 0.8 } },
    ['Vítkovice', 'Poruba', 'Hrabůvka', 'Přívoz', 'Zábřeh', 'Michálkovice'],
    ['Coking Plant', 'Ostravice Bank', 'Shaft Head', 'Rolling Hall', 'Slag Heap']),
  city('sialkot', 'Sialkot', 'Pakistan', '🇵🇰',
    { name: 'A Hundred Thousand Hands', blurb: 'Every third door on the street is a workshop. Labour costs nothing and knows less.',
      mods: { wage: 0.45, skill: 0.75, shopScale: 1.35, demand: 0.8 } },
    ['Rangpura', 'Kashmiri Mohalla', 'Pul Aik', 'Sublime Chowk', 'Ugoki', 'Neka Pura'],
    ['Instrument Row', 'Aik Bridge', 'Grinding Alley', 'Export Shed', 'Bazaar Gate']),
  city('damascus', 'Damascus', 'Syria', '🇸🇾',
    { name: 'The Old Name', blurb: 'The word on the blade doubles its price. Getting the steel to the shop is another matter.',
      mods: { demand: 1.6, iron: 1.5, funding: 0.7 } },
    ['Bab Touma', 'Midan', 'Sarouja', 'Qanawat', 'Amara', 'Shaghour'],
    ['Souq Forge', 'Barada Channel', 'Citadel Wall', 'Caravan Yard', 'Steel Merchant']),
  city('moradabad', 'Moradabad', 'India', '🇮🇳',
    { name: 'Brass City', blurb: 'Whole streets of hammers and a river of cheap hands, all making things nobody pays much for.',
      mods: { wage: 0.5, iron: 1.25, shopScale: 1.4, demand: 0.7, chill: 0.85 } },
    ['Peetal Nagri', 'Katghar', 'Mughalpura', 'Lajpat Nagar', 'Buddhi Vihar', 'Kanth Road'],
    ['Ramganga Ghat', 'Brass Bazaar', 'Casting Yard', 'Polishing Row', 'Rail Siding']),
  city('amozoc', 'Amozoc', 'Mexico', '🇲🇽',
    { name: 'A Long Way From The Tool Room', blurb: 'Spurs and bits for four hundred years, and the nearest die-cutter is a week away by road.',
      mods: { dieDelay: 1, wage: 0.7, demand: 0.95, shopScale: 1.1 } },
    ['San Salvador', 'La Purísima', 'Santa Cruz', 'Guadalupe', 'El Calvario', 'Casa Blanca'],
    ['Spur Row', 'Charcoal Kiln', 'Church Square', 'Road to Puebla', 'Bellows Yard']),
  city('longquan', 'Longquan', 'China', '🇨🇳',
    { name: 'The Sword Springs', blurb: 'Mountain water, mountain charcoal, and a very long way to any buyer.',
      mods: { skill: 1.15, demand: 0.7, funding: 0.7, shopScale: 1.2 } },
    ['Jianchi', 'Chating', 'Anren', 'Bacun', 'Longyuan', 'Xiaomei'],
    ['Sword Spring', 'Kiln Terrace', 'Bamboo Bellows', 'Mountain Road', 'Quenching Pool']),
  city('tromso', 'Tromsø', 'Norway', '🇳🇴',
    { name: 'Nine Months Of Winter', blurb: 'The fire is fighting the weather from the moment it is lit.',
      mods: { chill: 1.45, draught: 0.03, funding: 1.15, wage: 1.2 } },
    ['Tromsdalen', 'Kvaløysletta', 'Håpet', 'Stakkevollan', 'Bjerkaker', 'Mortensnes'],
    ['Harbour Shed', 'Sound Ferry', 'Boat Forge', 'Anchor Yard', 'Net Loft']),
  city('kano', 'Kano', 'Nigeria', '🇳🇬',
    { name: 'The Old Forges', blurb: 'Charcoal, not coke. The fire is patient, the heat is dear, and the shop is ancient.',
      mods: { coal: 0.78, iron: 1.3, funding: 0.65, chill: 0.8, wage: 0.6 } },
    ['Dala', 'Gwale', 'Fagge', 'Kurmi', 'Sabon Gari', 'Tarauni'],
    ['Dye Pits', 'Kurmi Market', 'City Wall Gate', 'Charcoal Row', 'Smiths’ Quarter']),
  city('esfahan', 'Esfahan', 'Iran', '🇮🇷',
    { name: 'The Hammer Bazaar', blurb: 'A covered mile of anvils. Buyers are generous, stock is not, and dust eats tooling.',
      mods: { demand: 1.3, iron: 1.4, wear: 1.4, funding: 0.65 } },
    ['Jolfa', 'Dardasht', 'Chaharbagh', 'Naqsh-e Jahan', 'Khaju', 'Sonbolestan'],
    ['Coppersmiths’ Row', 'Bridge of Thirty-Three', 'Caravanserai', 'Bazaar Vault', 'Zayandeh Bank']),
  city('bamako', 'Bamako', 'Mali', '🇲🇱',
    { name: 'Charcoal And Rain', blurb: 'Fuel is burned wood and half the year the wood is wet.',
      mods: { coal: 0.76, seasonality: 0.45, iron: 1.3, funding: 0.6, wage: 0.55 } },
    ['Badalabougou', 'Hamdallaye', 'Niaréla', 'Bozola', 'Lafiabougou', 'Magnambougou'],
    ['Niger Bank', 'Blacksmiths’ Line', 'Market Bridge', 'Charcoal Landing', 'Bellows Pit']),
  city('kathmandu', 'Kathmandu', 'Nepal', '🇳🇵',
    { name: 'Thin Air', blurb: 'Two thousand shops and not enough air in any of them to make a fire behave.',
      mods: { coal: 0.8, chill: 1.2, funding: 0.62, skill: 1.15, demand: 0.85 } },
    ['Patan', 'Thamel', 'Bhaktapur', 'Kirtipur', 'Boudha', 'Chhetrapati'],
    ['Bell Foundry', 'Durbar Step', 'Copper Lane', 'Bagmati Bank', 'Temple Yard']),
  city('potosi', 'Potosí', 'Bolivia', '🇧🇴',
    { name: 'Four Thousand Metres', blurb: 'The highest forges on earth. The fire is starved, the men are cold, and the mine pays nothing.',
      mods: { coal: 0.75, chill: 1.4, wage: 0.6, demand: 0.75, funding: 0.6 } },
    ['Cerro Rico', 'San Cristóbal', 'Villa Imperial', 'Cantumarca', 'Ckochas', 'Pailaviri'],
    ['Mine Head', 'Mint Yard', 'Ore Stair', 'Ingenio Ruin', 'Altiplano Road']),
  city('chittagong', 'Chittagong', 'Bangladesh', '🇧🇩',
    { name: 'Breaking Ships', blurb: 'Endless free steel off the beach, none of it clean, and it destroys everything you cut it with.',
      mods: { iron: 0.4, skill: 0.7, wear: 1.7, demand: 0.6, funding: 0.55, shopScale: 1.5 } },
    ['Sitakunda', 'Bhatiary', 'Pahartali', 'Halishahar', 'Patenga', 'Kattali'],
    ['Beaching Ground', 'Plate Yard', 'Cutting Line', 'Rerolling Shed', 'Scrap Road']),
  city('norilsk', 'Norilsk', 'Russia', '🇷🇺',
    { name: 'The Coldest Forge On Earth', blurb: 'Minus forty outside the door for eight months. Nothing here is easy and nothing here is warm.',
      mods: { chill: 1.5, draught: 0.05, coal: 0.95, funding: 0.58, wage: 0.7, demand: 0.75 } },
    ['Talnakh', 'Kayerkan', 'Oganer', 'Medvezhy Ruchey', 'Zapolyarny', 'Nadezhda'],
    ['Smelter Gate', 'Permafrost Row', 'Nickel Shed', 'Tundra Road', 'Winter Yard']),
];

export const CITY_INDEX = Object.fromEntries(CITIES.map((c, i) => [c.id, i]));
export const getCity = (id) => CITIES[CITY_INDEX[id]];

/* ------------------------------------------------------------------ *
 * Workshops
 * ------------------------------------------------------------------ */

/** Small local quirks, so no two workshops in a city feel identical. */
const QUIRKS = [
  { id: 'plain', label: null, mods: {} },
  { id: 'water', label: 'Water-powered hammer', mods: { skill: 1.3, shopScale: 1.2 } },
  { id: 'cellar', label: 'Cellar shop', mods: { chill: 1.2, coal: 0.92 } },
  { id: 'quay', label: 'On the quay', mods: { iron: 0.8, demand: 1.15 } },
  { id: 'jobbing', label: 'A jobbing shop', mods: { shopScale: 0.7, wage: 0.85 } },
  { id: 'toolroom', label: 'Its own tool room', mods: { wear: 0.6, dieDelay: 0 } },
  { id: 'shed', label: 'A draughty shed', mods: { draught: 0.03, funding: 1.15 } },
  { id: 'guild', label: 'Guild house', mods: { demand: 1.25, fatigue: 1.15 } },
];

const workshopSeed = (cityIdx, i) => (cityIdx + 1) * 1_000_003 + (i + 1) * 7919;

/** The 25 workshops of a city, always generated the same way. */
export function workshopsFor(cityId) {
  const cityIdx = CITY_INDEX[cityId];
  const cy = CITIES[cityIdx];
  const out = [];
  for (let i = 0; i < WORKSHOPS_PER_CITY; i++) {
    const rng = mulberry32(workshopSeed(cityIdx, i));
    const quirk = QUIRKS[Math.floor(rng() * QUIRKS.length)];
    const usePlace = rng() < 0.4;
    const name = usePlace
      ? cy.places[Math.floor(rng() * cy.places.length)]
      : `${cy.quarters[Math.floor(rng() * cy.quarters.length)]} ${rng() < 0.5 ? 'Forge' : 'Works'}`;
    const alloy = ALLOYS[Math.floor(rng() * ALLOYS.length)];
    const shopScale = 0.8 + rng() * 0.5;
    out.push({
      index: i,
      cityId,
      name: dedupeName(out, name, i),
      tier: TIER_LAYOUT[i],
      quirk: quirk.label,
      alloyId: alloy.id,
      seed: workshopSeed(cityIdx, i),
      mods: mergeMods(quirk.mods, { shopScale }),
    });
  }
  return out;
}

/** Two workshops in a city sharing a name would be confusing on the map. */
function dedupeName(existing, name, i) {
  if (!existing.some((w) => w.name === name)) return name;
  return `${name} (${i + 1})`;
}

/** Multipliers multiply, shifts add. */
export function mergeMods(...list) {
  const out = {};
  const additive = new Set(['draught', 'seasonality', 'dieDelay']);
  for (const mods of list) {
    for (const [key, value] of Object.entries(mods || {})) {
      if (additive.has(key)) out[key] = (out[key] ?? 0) + value;
      else out[key] = (out[key] ?? 1) * value;
    }
  }
  return out;
}

/** Everything sim.js needs to work one workshop. */
export function runConfigFor(cityId, workshopIndex) {
  const cy = getCity(cityId);
  const workshop = workshopsFor(cityId)[workshopIndex];
  const tier = TIERS[workshop.tier];
  return {
    seed: workshop.seed,
    shifts: tier.shifts,
    purse: tier.purse,
    retainer: tier.retainer,
    alloyId: workshop.alloyId,
    mods: mergeMods(tier.mods, cy.challenge.mods, workshop.mods),
    workshop: { cityId, index: workshopIndex, name: workshop.name, tier: workshop.tier },
  };
}

/**
 * The pieces you must deliver to hold a workshop: a share of what the best
 * reference doctrine makes there. Cached on the campaign so the bar never
 * moves under a player.
 */
export function targetFor(campaign, cityId, workshopIndex) {
  const key = `${cityId}:${workshopIndex}`;
  if (campaign?.targets?.[key] != null) return campaign.targets[key];
  const config = runConfigFor(cityId, workshopIndex);
  const tier = TIERS[workshopsFor(cityId)[workshopIndex].tier];
  const par = parPieces(config);
  const target = Math.max(1, Math.round(par * tier.parFactor));
  if (campaign) {
    campaign.targets = campaign.targets || {};
    campaign.targets[key] = target;
  }
  return target;
}

/* ------------------------------------------------------------------ *
 * Progress
 * ------------------------------------------------------------------ */

/**
 * Which version of the model the cached targets were measured against.
 *
 * A target is a share of what `parPieces` finds at a workshop, so a change to
 * `sim.js` that moves par makes every cached bar wrong — measured honestly,
 * but against a game that no longer exists. Bump this whenever that happens
 * and `migrateCampaign` drops the stale bars, so each workshop is re-measured
 * the next time it is offered.
 *
 * 1 → the first shipped model.
 */
export const TARGET_MODEL_VERSION = 1;

export function newCampaign() {
  return {
    version: 1,
    targetModel: TARGET_MODEL_VERSION,
    capital: 0,         // guild capital, £
    held: {},           // cityId → array of held workshop indexes
    targets: {},        // "cityId:index" → the bar, cached once shown
    guild: null,        // built by ops.js once five cities are done
    stats: { runsPlayed: 0, runsWon: 0, piecesMade: 0 },
  };
}

/**
 * Bring a loaded campaign up to the current model.
 *
 * Only the cached targets are dropped — workshops held, capital, statistics
 * and the guild all survive, because none of them is a claim about what a
 * workshop asks for. A workshop already taken keeps nothing that matters: its
 * bar has been cleared. One not yet attempted gets an honest bar the next time
 * it is offered. And a commission being worked right now is untouched, because
 * the run carries its own copy of the target from the moment it starts, which
 * is what keeps the bar from moving under the player mid-commission.
 *
 * Returns how many bars were dropped, so the caller can say so.
 */
export function migrateCampaign(campaign) {
  if (!campaign) return { cleared: 0, from: null };
  const from = campaign.targetModel ?? 0;
  if (from === TARGET_MODEL_VERSION) return { cleared: 0, from };

  const cleared = Object.keys(campaign.targets || {}).length;
  campaign.targets = {};
  campaign.targetModel = TARGET_MODEL_VERSION;
  return { cleared, from };
}

export const heldIn = (campaign, cityId) => campaign.held[cityId] || [];
export const isHeld = (campaign, cityId, i) => heldIn(campaign, cityId).includes(i);
export const cityDone = (campaign, cityId) =>
  heldIn(campaign, cityId).length >= WORKSHOPS_TO_TAKE_CITY;

export function completedCities(campaign) {
  return CITIES.filter((c) => cityDone(campaign, c.id)).map((c) => c.id);
}

/**
 * Is this city inside the free tier?
 *
 * Purely positional, and deliberately kept here with the rest of the
 * progression rules rather than in the shop: the campaign decides what the
 * free tier *is*, and the payments layer only decides whether it applies.
 */
export function isCityFree(cityId, freeCities) {
  return CITY_INDEX[cityId] < freeCities;
}

/** Cities open two at a time, so there is always somewhere else to go. */
export function isCityUnlocked(campaign, cityId) {
  return CITY_INDEX[cityId] <= completedCities(campaign).length + 1;
}

/** Workshops are held in order, so the difficulty ramp holds. */
export function isWorkshopUnlocked(campaign, cityId, i) {
  if (!isCityUnlocked(campaign, cityId)) return false;
  if (i === 0) return true;
  return isHeld(campaign, cityId, i - 1);
}

export function nextWorkshop(campaign, cityId) {
  const held = heldIn(campaign, cityId);
  for (let i = 0; i < WORKSHOPS_PER_CITY; i++) if (!held.includes(i)) return i;
  return null;
}

/** Record a held workshop. Returns what changed, for the celebration screen. */
export function holdWorkshop(campaign, cityId, i, pieces) {
  const before = cityDone(campaign, cityId);
  const list = campaign.held[cityId] || (campaign.held[cityId] = []);
  if (!list.includes(i)) list.push(i);
  list.sort((a, b) => a - b);
  campaign.capital = Math.round((campaign.capital + pieces * CAPITAL_PER_PIECE) * 100) / 100;
  campaign.stats.piecesMade += Math.round(pieces);
  const cityJustDone = !before && cityDone(campaign, cityId);
  const done = completedCities(campaign).length;
  return {
    cityJustDone,
    citiesDone: done,
    guildJustUnlocked: cityJustDone && done === CITIES_FOR_GUILD,
  };
}

export const guildUnlocked = (campaign) => completedCities(campaign).length >= CITIES_FOR_GUILD;

export function campaignProgress(campaign) {
  const held = CITIES.reduce((n, c) => n + heldIn(campaign, c.id).length, 0);
  return {
    workshops: held,
    totalWorkshops: CITIES.length * WORKSHOPS_PER_CITY,
    cities: completedCities(campaign).length,
    totalCities: CITIES.length,
  };
}

/* ------------------------------------------------------------------ *
 * Explaining a workshop
 * ------------------------------------------------------------------ */

const NEUTRAL = {
  coal: 1, chill: 1, skill: 1, wage: 1, iron: 1, demand: 1, funding: 1,
  wear: 1, fatigue: 1, pride: 1, draught: 0, seasonality: 0, dieDelay: 0, shopScale: 1,
};

/**
 * Turn merged modifiers into plain sentences. A smith should be able to see
 * what a shop will do to them before they take the commission.
 */
export function describeMods(mods) {
  const m = { ...NEUTRAL, ...mods };
  const out = [];
  const pct = (v) => `${Math.round(Math.abs(v - 1) * 100)}%`;

  if (m.coal >= 1.2) out.push({ icon: '⚫', text: `Superb coke — a notch of bellows costs ${pct(m.coal)} less.` });
  if (m.coal <= 0.85) out.push({ icon: '🪵', text: `Poor fuel — every notch of bellows costs ${Math.round((1 / m.coal - 1) * 100)}% more.` });
  if (m.chill >= 1.2) out.push({ icon: '🥶', text: `A cold shop — the fire gives its heat back ${pct(m.chill)} faster.` });
  if (m.chill <= 0.9) out.push({ icon: '🌤️', text: 'A warm shop. The fire holds what you put into it.' });
  if (m.draught >= 0.03) out.push({ icon: '🚪', text: 'A draught nobody has ever fixed. Heat costs more here whatever you do.' });
  if (m.skill >= 1.15) out.push({ icon: '🎯', text: `Practised hands — an apprentice is worth ${pct(m.skill)} more at the anvil.` });
  if (m.skill <= 0.85) out.push({ icon: '🫤', text: `Green hands — an apprentice is worth ${pct(m.skill)} less.` });
  if (m.wage <= 0.75) out.push({ icon: '🪙', text: `Cheap labour — wages are ${pct(m.wage)} below the going rate.` });
  if (m.wage >= 1.2) out.push({ icon: '💷', text: `Dear labour — wages run ${pct(m.wage)} over.` });
  if (m.iron <= 0.75) out.push({ icon: '🧲', text: `Stock is nearly free — ${pct(m.iron)} off every swing's worth of iron.` });
  if (m.iron >= 1.25) out.push({ icon: '📦', text: `Stock is dear — ${pct(m.iron)} on top of every swing's worth of iron.` });
  if (m.demand >= 1.2) out.push({ icon: '💰', text: `Generous buyers — a finished piece fetches ${pct(m.demand)} more.` });
  if (m.demand <= 0.8) out.push({ icon: '📉', text: `Thin market — a finished piece fetches ${pct(m.demand)} less.` });
  if (m.funding >= 1.2) out.push({ icon: '🏦', text: `Well backed — ${pct(m.funding)} more in the purse and the retainer.` });
  if (m.funding <= 0.8) out.push({ icon: '🕳️', text: `Barely backed — ${pct(m.funding)} less in the purse and the retainer.` });
  if (m.wear <= 0.75) out.push({ icon: '🔧', text: `Tooling lasts here — dies wear ${pct(m.wear)} slower.` });
  if (m.wear >= 1.25) out.push({ icon: '🪚', text: `Tooling is eaten alive — dies wear ${pct(m.wear)} faster.` });
  if (m.fatigue >= 1.25) out.push({ icon: '😮‍💨', text: 'The shop tires fast. A hard pace will not hold for long.' });
  if (m.pride >= 1.3) out.push({ icon: '🎖️', text: 'A proud shop. Clean work puts the morale straight back.' });
  if (m.seasonality >= 0.3) out.push({ icon: '🌧️', text: 'A wet season halfway through. Fuel gets dear and then cheap again.' });
  if (m.shopScale >= 1.3) out.push({ icon: '🏭', text: 'A big shop. More anvils, more hands, and every bill to match.' });
  if (m.shopScale <= 0.8) out.push({ icon: '🏚️', text: 'A small shop. Everything costs less and everything makes less.' });
  return out;
}
