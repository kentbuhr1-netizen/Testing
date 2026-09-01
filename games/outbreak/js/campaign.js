/**
 * Outbreak — the campaign.
 *
 * 25 regions, 25 districts each. Districts inside a region ramp through four
 * difficulty tiers; regions themselves each bend the rules in one distinctive
 * way. Hold all 25 districts and the region is yours.
 *
 * Targets are not hand-written. Every district's bar is derived from
 * `parSaved` — the lives the best of a family of reference policies saves on
 * that exact district, with that region's density, budget and hospitals —
 * scaled by the tier. A mosquito-borne outbreak in a district with no labs
 * therefore gets an honestly lower bar than a traceable flu in a rich one,
 * without anyone balancing 625 numbers by hand.
 */
import { parSaved, mulberry32, PATHOGENS } from './sim.js';

export const DISTRICTS_PER_REGION = 25;
/**
 * How much of a region you must hold before it counts as taken. Set to all 25
 * districts; lower it to shorten the campaign without touching anything else.
 */
export const DISTRICTS_TO_TAKE_REGION = DISTRICTS_PER_REGION;
export const REGIONS_FOR_OPS = 5;   // the agency unlocks once this many regions are done

/** Lives saved convert into agency budget, in $M. */
export const GRANT_PER_LIFE = 0.02;

/* ------------------------------------------------------------------ *
 * Difficulty
 * ------------------------------------------------------------------ */

export const TIERS = {
  easy: {
    id: 'easy', label: 'Easy', icon: '🟢', weeks: 10, funds: 14, baseFunds: 8.5, parFactor: 0.4,
    blurb: 'Caught early, well funded. Room to learn the pathogen.',
    mods: { labs: 1.15, bedsBase: 1.15 },
  },
  medium: {
    id: 'medium', label: 'Medium', icon: '🟡', weeks: 12, funds: 11, baseFunds: 7.0, parFactor: 0.62,
    blurb: 'A fair fight. Every week you waste is a ward.',
    mods: {},
  },
  hard: {
    id: 'hard', label: 'Hard', icon: '🟠', weeks: 14, funds: 9, baseFunds: 6.0, parFactor: 0.8,
    blurb: 'Thin budget, tired public, and it had a head start.',
    mods: { fatigue: 1.15, labs: 0.9 },
  },
  impossible: {
    id: 'impossible', label: 'Impossible', icon: '🔴', weeks: 16, funds: 8, baseFunds: 5.2, parFactor: 0.93,
    blurb: 'Near-perfect judgement, or a graveyard.',
    mods: { fatigue: 1.3, labs: 0.8, bedsBase: 0.85 },
  },
};

/** Which tier each of a region's 25 districts belongs to. */
export const TIER_LAYOUT = [
  ...Array(7).fill('easy'),
  ...Array(7).fill('medium'),
  ...Array(7).fill('hard'),
  ...Array(4).fill('impossible'),
];

/* ------------------------------------------------------------------ *
 * Regions
 * ------------------------------------------------------------------ */

const region = (id, name, country, flag, challenge, wards, places) =>
  ({ id, name, country, flag, challenge, wards, places });

/**
 * Ordered gentlest-feeling to harshest. `mods` are merged over the tier's own,
 * so a region bends every district in it the same way.
 *
 * Difficulty here is epidemiological, not economic: density, mobility, trust,
 * age structure and hospital stock. A young population is a large, real
 * advantage, and several of the hardest-looking regions have it.
 */
export const REGIONS = [
  region('wellington', 'Wellington', 'New Zealand', '🇳🇿',
    { name: 'The Moat', blurb: 'An island at the end of the world. Nothing arrives that you did not let in.',
      mods: { imports: 0, trust: 1.25, density: 0.85, popScale: 0.8 } },
    ['Thorndon', 'Newtown', 'Karori', 'Miramar', 'Kelburn', 'Petone'],
    ['Harbour Quay', 'Botanic Rise', 'Hutt Crossing', 'Airport Flats', 'Cable Top']),
  region('reykjavik', 'Reykjavík', 'Iceland', '🇮🇸',
    { name: 'Everyone Is Known', blurb: 'A small population and the best genome lab per head on earth.',
      mods: { labs: 1.6, imports: 0.5, popScale: 0.6, trust: 1.2 } },
    ['Vesturbær', 'Hlíðar', 'Breiðholt', 'Laugardalur', 'Grafarvogur', 'Seltjarnarnes'],
    ['Harbour Front', 'Geothermal Works', 'University Hill', 'Airport Road', 'Hallgrím Steps']),
  region('oslo', 'Oslo', 'Norway', '🇳🇴',
    { name: 'Deep Pockets', blurb: 'A sovereign fund behind every decision. Buy your way out early.',
      mods: { funding: 1.5, economy: 0.6, density: 0.85, trust: 1.15 } },
    ['Grünerløkka', 'Frogner', 'Bjørvika', 'Sagene', 'Grorud', 'Nordre Aker'],
    ['Opera Roof', 'Fjord Ferry', 'Ski Jump Base', 'Central Station', 'Palace Park']),
  region('perth', 'Perth', 'Australia', '🇦🇺',
    { name: 'Two Thousand Miles Of Nothing', blurb: 'The most isolated city on earth, and it knows it.',
      mods: { imports: 0.2, trust: 1.2, density: 0.8, seasonality: 0.12 } },
    ['Fremantle', 'Subiaco', 'Joondalup', 'Victoria Park', 'Scarborough', 'Midland'],
    ['Swan Crossing', 'Port Gate', 'Kings Park Rise', 'Rail Terminus', 'Beach Road']),
  region('seoul', 'Seoul', 'South Korea', '🇰🇷',
    { name: 'Contact Tracing Nation', blurb: 'Dense as anywhere, but the tracers are ferociously good.',
      mods: { labs: 2.0, density: 1.35, trust: 1.15, popScale: 1.2 } },
    ['Gangnam', 'Mapo', 'Jongno', 'Songpa', 'Yongsan', 'Nowon'],
    ['Han Bridge', 'Subway Hub', 'Palace Gate', 'Market Arcade', 'Tower Base']),
  region('vienna', 'Vienna', 'Austria', '🇦🇹',
    { name: 'An Old City', blurb: 'Superb hospitals, and the oldest population that will fill them.',
      mods: { ageing: 1.45, bedsBase: 1.4, density: 1.1 } },
    ['Leopoldstadt', 'Favoriten', 'Neubau', 'Döbling', 'Simmering', 'Ottakring'],
    ['Opera Steps', 'Prater Gate', 'Danube Path', 'Ring Tram', 'Palace Court']),
  region('montreal', 'Montréal', 'Canada', '🇨🇦',
    { name: 'Six Months Indoors', blurb: 'When the cold comes everyone goes inside, and so does the outbreak.',
      mods: { seasonality: 0.4, ageing: 1.15, bedsBase: 1.1 } },
    ['Plateau', 'Verdun', 'Rosemont', 'Ahuntsic', 'Lachine', 'Hochelaga'],
    ['Metro Berri', 'Mount Royal', 'Old Port', 'Campus Gate', 'Bridge Approach']),
  region('lisbon', 'Lisbon', 'Portugal', '🇵🇹',
    { name: 'Grey And Sunlit', blurb: 'An old population in a warm city, and a health budget that shows its age.',
      mods: { ageing: 1.4, funding: 0.85, imports: 1.5 } },
    ['Alfama', 'Belém', 'Graça', 'Benfica', 'Chiado', 'Olivais'],
    ['Tram Stop 28', 'Cruise Terminal', 'Castle Gate', 'Riverside Walk', 'Market Hall']),
  region('santiago', 'Santiago', 'Chile', '🇨🇱',
    { name: 'The Basin', blurb: 'A hard winter trapped under an inversion layer. The season decides the curve.',
      mods: { seasonality: 0.5, density: 1.15, funding: 0.9 } },
    ['Providencia', 'Maipú', 'Ñuñoa', 'Recoleta', 'La Florida', 'Puente Alto'],
    ['Metro Baquedano', 'Cerro Santa Lucía', 'Central Market', 'Bus Terminal', 'Andes Foot']),
  region('prague', 'Prague', 'Czechia', '🇨🇿',
    { name: 'Nobody Believes The Ministry', blurb: 'Cheap testing, plentiful beds, and a public that will not be told.',
      mods: { trust: 0.7, fatigue: 1.3, labs: 1.3, bedsBase: 1.2 } },
    ['Vinohrady', 'Žižkov', 'Smíchov', 'Karlín', 'Holešovice', 'Dejvice'],
    ['Charles Bridge', 'Main Station', 'Castle Steps', 'Riverbank', 'Tram Depot']),
  region('athens', 'Athens', 'Greece', '🇬🇷',
    { name: 'Season Of Arrivals', blurb: 'Every summer the population doubles and none of it is local.',
      mods: { imports: 5, ageing: 1.4, funding: 0.8, seasonality: 0.25 } },
    ['Plaka', 'Exarcheia', 'Kypseli', 'Piraeus', 'Kallithea', 'Marousi'],
    ['Ferry Port', 'Acropolis Path', 'Metro Syntagma', 'Airport Road', 'Agora Gate']),
  region('milan', 'Milan', 'Italy', '🇮🇹',
    { name: 'Lombardy', blurb: 'Dense, old, and the first place a European outbreak ever gets to.',
      mods: { ageing: 1.6, density: 1.3, imports: 3, popScale: 1.15 } },
    ['Navigli', 'Brera', 'Lambrate', 'Bicocca', 'Porta Romana', 'Bovisa'],
    ['Duomo Square', 'Centrale Station', 'Fair Grounds', 'Canal Bank', 'Stadium Gate']),
  region('miami', 'Miami', 'United States', '🇺🇸',
    { name: 'Nobody Is Staying In', blurb: 'A tourist economy that will not close and a public that will not comply.',
      mods: { trust: 0.6, fatigue: 1.45, imports: 6, economy: 1.5, ageing: 1.2 } },
    ['Little Havana', 'Wynwood', 'Hialeah', 'Coral Way', 'Overtown', 'Brickell'],
    ['Cruise Terminal', 'Beach Boardwalk', 'Airport Concourse', 'Stadium Lot', 'Marina Gate']),
  region('barcelona', 'Barcelona', 'Spain', '🇪🇸',
    { name: 'Thirty Million Visitors', blurb: 'Tight streets, packed flights, and an economy built on both.',
      mods: { imports: 7, density: 1.35, economy: 1.4, ageing: 1.25 } },
    ['Raval', 'Gràcia', 'Sants', 'Poblenou', 'Sarrià', 'Nou Barris'],
    ['Rambla Head', 'Cruise Quay', 'Sagrada Queue', 'Metro Sants', 'Beach Front']),
  region('buenosaires', 'Buenos Aires', 'Argentina', '🇦🇷',
    { name: 'The Budget Is A Rumour', blurb: 'Close anything and the money to reopen it evaporates.',
      mods: { economy: 2.2, funding: 0.7, density: 1.3, ageing: 1.2 } },
    ['La Boca', 'Palermo', 'Recoleta', 'Flores', 'Belgrano', 'Barracas'],
    ['Obelisk Crossing', 'Retiro Terminal', 'Port Gate', 'Stadium Approach', 'Market Row']),
  region('bangkok', 'Bangkok', 'Thailand', '🇹🇭',
    { name: 'Monsoon', blurb: 'The rains bring the mosquitoes, and the mosquitoes do not care what is closed.',
      mods: { seasonality: 0.45, density: 1.4, imports: 4, funding: 0.8, ageing: 0.95 } },
    ['Silom', 'Thonburi', 'Bang Kapi', 'Chatuchak', 'Din Daeng', 'Klong Toei'],
    ['Sky Train Hub', 'Floating Market', 'Grand Palace', 'Port Klong', 'Airport Link']),
  region('istanbul', 'Istanbul', 'Türkiye', '🇹🇷',
    { name: 'Two Continents', blurb: 'Everything travelling between Europe and Asia comes through here first.',
      mods: { imports: 12, density: 1.4, popScale: 1.3, funding: 0.85 } },
    ['Beyoğlu', 'Kadıköy', 'Fatih', 'Üsküdar', 'Şişli', 'Bakırköy'],
    ['Bosphorus Ferry', 'Grand Bazaar', 'Airport Hall', 'Bridge Approach', 'Rail Terminus']),
  region('johannesburg', 'Johannesburg', 'South Africa', '🇿🇦',
    { name: 'A Young City', blurb: 'Half the population is under thirty. Far fewer will die — if the wards hold.',
      mods: { ageing: 0.5, bedsBase: 0.55, density: 1.25, funding: 0.75 } },
    ['Soweto', 'Sandton', 'Alexandra', 'Braamfontein', 'Yeoville', 'Randburg'],
    ['Taxi Rank', 'Mine Headgear', 'Campus Gate', 'Rail Junction', 'Market Square']),
  region('losangeles', 'Los Angeles', 'United States', '🇺🇸',
    { name: 'Ninety Cities In A Trenchcoat', blurb: 'No centre, no consensus, and a mandate that stops at every county line.',
      mods: { trust: 0.55, fatigue: 1.5, density: 0.95, popScale: 1.25, economy: 1.3 } },
    ['Boyle Heights', 'Koreatown', 'Watts', 'Van Nuys', 'Westlake', 'Inglewood'],
    ['Union Station', 'Port of Entry', 'Stadium Lot', 'Freeway Interchange', 'Pier Head']),
  region('saopaulo', 'São Paulo', 'Brazil', '🇧🇷',
    { name: 'Twenty Million', blurb: 'An enormous, unequal city where closing the centre does nothing for the edge.',
      mods: { density: 1.5, popScale: 1.4, economy: 1.8, funding: 0.75, ageing: 0.95 } },
    ['Paulista', 'Brás', 'Itaquera', 'Pinheiros', 'Capão Redondo', 'Santo Amaro'],
    ['Metro Sé', 'Bus Terminal', 'Favela Stair', 'Industrial Belt', 'Stadium Gate']),
  region('cairo', 'Cairo', 'Egypt', '🇪🇬',
    { name: 'Faster Than The Labs', blurb: 'Twenty million people and testing capacity for a town.',
      mods: { labs: 0.4, density: 1.6, popScale: 1.35, funding: 0.7, ageing: 0.9 } },
    ['Zamalek', 'Shubra', 'Maadi', 'Giza', 'Heliopolis', 'Bulaq'],
    ['Ramses Station', 'Nile Crossing', 'Bazaar Lane', 'Ring Road Gate', 'Airport Road']),
  region('manila', 'Manila', 'Philippines', '🇵🇭',
    { name: 'Everyone Comes Home', blurb: 'A city of returning workers, and nowhere near enough beds for them.',
      mods: { imports: 14, bedsBase: 0.5, density: 1.7, funding: 0.7, ageing: 0.85 } },
    ['Tondo', 'Makati', 'Quezon', 'Pasay', 'Malate', 'Caloocan'],
    ['Airport Terminal', 'Port of Manila', 'Jeepney Rank', 'Market Row', 'Bay Walk']),
  region('lagos', 'Lagos', 'Nigeria', '🇳🇬',
    { name: 'Young And Unprotected', blurb: 'The youngest population in the campaign, and almost no hospital to lose.',
      mods: { ageing: 0.45, bedsBase: 0.3, labs: 0.45, density: 1.7, popScale: 1.3, funding: 0.6 } },
    ['Ikeja', 'Yaba', 'Surulere', 'Ajegunle', 'Lekki', 'Apapa'],
    ['Port Complex', 'Danfo Rank', 'Market Bridge', 'Campus Gate', 'Island Causeway']),
  region('mumbai', 'Mumbai', 'India', '🇮🇳',
    { name: 'Density Without Precedent', blurb: 'Neighbourhoods where distancing is a word with no physical meaning.',
      mods: { density: 2.1, popScale: 1.5, bedsBase: 0.5, trust: 0.85, ageing: 0.85, funding: 0.7 } },
    ['Dharavi', 'Andheri', 'Bandra', 'Colaba', 'Kurla', 'Borivali'],
    ['Local Rail Platform', 'Dock Gate', 'Market Lane', 'Mill Compound', 'Causeway']),
  region('dhaka', 'Dhaka', 'Bangladesh', '🇧🇩',
    { name: 'The Densest Place On Earth', blurb: 'Forty thousand people to the square kilometre. Nothing else in the campaign is close.',
      mods: { density: 2.4, popScale: 1.6, bedsBase: 0.28, labs: 0.4, funding: 0.55, ageing: 0.8, imports: 3 } },
    ['Gulshan', 'Mirpur', 'Old Dhaka', 'Uttara', 'Motijheel', 'Tejgaon'],
    ['River Ghat', 'Garment Quarter', 'Rail Crossing', 'Bus Stand', 'Bazaar Gate']),
];

export const REGION_INDEX = Object.fromEntries(REGIONS.map((r, i) => [r.id, i]));
export const getRegion = (id) => REGIONS[REGION_INDEX[id]];

/* ------------------------------------------------------------------ *
 * Districts
 * ------------------------------------------------------------------ */

/** Small local quirks, so no two districts in a region feel identical. */
const QUIRKS = [
  { id: 'plain', label: null, mods: {} },
  { id: 'campus', label: 'University quarter', mods: { ageing: 0.5, density: 1.25, trust: 1.1 } },
  { id: 'carehomes', label: 'Care homes', mods: { ageing: 1.8, density: 0.9 } },
  { id: 'transit', label: 'Transit interchange', mods: { imports: 4, density: 1.2 } },
  { id: 'informal', label: 'Informal settlement', mods: { density: 1.5, bedsBase: 0.6, labs: 0.7 } },
  { id: 'suburb', label: 'Low-rise suburb', mods: { density: 0.7, trust: 1.1 } },
  { id: 'port', label: 'Port district', mods: { imports: 6, density: 1.1, economy: 1.3 } },
  { id: 'hospital', label: 'Teaching hospital', mods: { bedsBase: 1.7, labs: 1.3 } },
];

const districtSeed = (regionIdx, i) => (regionIdx + 1) * 1_000_003 + (i + 1) * 7919;

/** The 25 districts of a region, always generated the same way. */
export function districtsFor(regionId) {
  const regionIdx = REGION_INDEX[regionId];
  const rg = REGIONS[regionIdx];
  const out = [];
  for (let i = 0; i < DISTRICTS_PER_REGION; i++) {
    const rng = mulberry32(districtSeed(regionIdx, i));
    const quirk = QUIRKS[Math.floor(rng() * QUIRKS.length)];
    const usePlace = rng() < 0.4;
    const name = usePlace
      ? rg.places[Math.floor(rng() * rg.places.length)]
      : `${rg.wards[Math.floor(rng() * rg.wards.length)]} ${rng() < 0.5 ? 'North' : 'South'}`;
    const pathogen = PATHOGENS[Math.floor(rng() * PATHOGENS.length)];
    const popScale = 0.8 + rng() * 0.5;
    out.push({
      index: i,
      regionId,
      name: dedupeName(out, name, i),
      tier: TIER_LAYOUT[i],
      quirk: quirk.label,
      pathogenId: pathogen.id,
      seed: districtSeed(regionIdx, i),
      mods: mergeMods(quirk.mods, { popScale }),
    });
  }
  return out;
}

/** Two districts in a region sharing a name would be confusing on the map. */
function dedupeName(existing, name, i) {
  if (!existing.some((d) => d.name === name)) return name;
  return `${name} (${i + 1})`;
}

/** Multipliers multiply, shifts add. */
export function mergeMods(...list) {
  const out = {};
  const additive = new Set(['imports', 'seasonality', 'vaccineDelay']);
  for (const mods of list) {
    for (const [key, value] of Object.entries(mods || {})) {
      if (additive.has(key)) out[key] = (out[key] ?? 0) + value;
      else out[key] = (out[key] ?? 1) * value;
    }
  }
  return out;
}

/** Everything sim.js needs to play one district. */
export function runConfigFor(regionId, districtIndex) {
  const rg = getRegion(regionId);
  const district = districtsFor(regionId)[districtIndex];
  const tier = TIERS[district.tier];
  return {
    seed: district.seed,
    weeks: tier.weeks,
    funds: tier.funds,
    baseFunds: tier.baseFunds,
    pathogenId: district.pathogenId,
    mods: mergeMods(tier.mods, rg.challenge.mods, district.mods),
    district: { regionId, index: districtIndex, name: district.name, tier: district.tier },
  };
}

/**
 * The lives you must save to hold a district: a share of what the best
 * reference policy saves there. Cached on the campaign so the bar never
 * moves under a player.
 */
export function targetFor(campaign, regionId, districtIndex) {
  const key = `${regionId}:${districtIndex}`;
  if (campaign?.targets?.[key] != null) return campaign.targets[key];
  const config = runConfigFor(regionId, districtIndex);
  const tier = TIERS[districtsFor(regionId)[districtIndex].tier];
  const par = parSaved(config);
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

export function newCampaign() {
  return {
    version: 1,
    treasury: 0,        // agency budget, $M
    held: {},           // regionId → array of held district indexes
    targets: {},        // "regionId:index" → the bar, cached once shown
    ops: null,          // built by ops.js once five regions are done
    stats: { runsPlayed: 0, runsWon: 0, livesSaved: 0 },
  };
}

export const heldIn = (campaign, regionId) => campaign.held[regionId] || [];
export const isHeld = (campaign, regionId, i) => heldIn(campaign, regionId).includes(i);
export const regionDone = (campaign, regionId) =>
  heldIn(campaign, regionId).length >= DISTRICTS_TO_TAKE_REGION;

export function completedRegions(campaign) {
  return REGIONS.filter((r) => regionDone(campaign, r.id)).map((r) => r.id);
}

/**
 * Is this region inside the free tier?
 *
 * Purely positional, and deliberately kept here with the rest of the
 * progression rules rather than in the shop: the campaign decides what the
 * free tier *is*, and the payments layer only decides whether it applies.
 */
export function isRegionFree(regionId, freeRegions) {
  return REGION_INDEX[regionId] < freeRegions;
}

/** Regions open two at a time, so there is always somewhere else to go. */
export function isRegionUnlocked(campaign, regionId) {
  return REGION_INDEX[regionId] <= completedRegions(campaign).length + 1;
}

/** Districts are held in order, so the difficulty ramp holds. */
export function isDistrictUnlocked(campaign, regionId, i) {
  if (!isRegionUnlocked(campaign, regionId)) return false;
  if (i === 0) return true;
  return isHeld(campaign, regionId, i - 1);
}

export function nextDistrict(campaign, regionId) {
  const held = heldIn(campaign, regionId);
  for (let i = 0; i < DISTRICTS_PER_REGION; i++) if (!held.includes(i)) return i;
  return null;
}

/** Record a held district. Returns what changed, for the celebration screen. */
export function holdDistrict(campaign, regionId, i, saved) {
  const before = regionDone(campaign, regionId);
  const list = campaign.held[regionId] || (campaign.held[regionId] = []);
  if (!list.includes(i)) list.push(i);
  list.sort((a, b) => a - b);
  campaign.treasury = Math.round((campaign.treasury + saved * GRANT_PER_LIFE) * 100) / 100;
  campaign.stats.livesSaved += Math.round(saved);
  const regionJustDone = !before && regionDone(campaign, regionId);
  const done = completedRegions(campaign).length;
  return {
    regionJustDone,
    regionsDone: done,
    opsJustUnlocked: regionJustDone && done === REGIONS_FOR_OPS,
  };
}

export const opsUnlocked = (campaign) => completedRegions(campaign).length >= REGIONS_FOR_OPS;

export function campaignProgress(campaign) {
  const held = REGIONS.reduce((n, r) => n + heldIn(campaign, r.id).length, 0);
  return {
    districts: held,
    totalDistricts: REGIONS.length * DISTRICTS_PER_REGION,
    regions: completedRegions(campaign).length,
    totalRegions: REGIONS.length,
  };
}

/* ------------------------------------------------------------------ *
 * Explaining a district
 * ------------------------------------------------------------------ */

const NEUTRAL = {
  density: 1, trust: 1, fatigue: 1, ageing: 1, labs: 1, bedsBase: 1,
  funding: 1, economy: 1, imports: 0, vaccineDelay: 0, seasonality: 0, popScale: 1,
};

/**
 * Turn merged modifiers into plain sentences. A player should be able to see
 * what a district will do to them before they take it on.
 */
export function describeMods(mods) {
  const m = { ...NEUTRAL, ...mods };
  const out = [];
  const pct = (v) => `${Math.round(Math.abs(v - 1) * 100)}%`;

  if (m.density >= 1.2) out.push({ icon: '🏙️', text: `Crowded — transmission runs ${pct(m.density)} hotter.` });
  if (m.density <= 0.9) out.push({ icon: '🏡', text: `Spread out — transmission runs ${pct(m.density)} cooler.` });
  if (m.ageing >= 1.3) out.push({ icon: '👵', text: `An old population — ${pct(m.ageing)} more of the infected die.` });
  if (m.ageing <= 0.7) out.push({ icon: '🧒', text: `A young population — ${pct(m.ageing)} fewer of the infected die.` });
  if (m.trust <= 0.8) out.push({ icon: '📢', text: 'Low trust — restrictions land at a fraction of their strength.' });
  if (m.trust >= 1.15) out.push({ icon: '🤝', text: 'High trust — people actually do what is asked.' });
  if (m.fatigue >= 1.25) out.push({ icon: '😮‍💨', text: 'Patience burns fast here. Long closures will not hold.' });
  if (m.labs >= 1.3) out.push({ icon: '🔬', text: `Excellent laboratories — ${pct(m.labs)} more testing throughput.` });
  if (m.labs <= 0.75) out.push({ icon: '🧫', text: `Thin laboratory capacity — tracing is swamped ${pct(m.labs)} sooner.` });
  if (m.bedsBase >= 1.3) out.push({ icon: '🏥', text: `Well-equipped hospitals — ${pct(m.bedsBase)} more beds to start.` });
  if (m.bedsBase <= 0.7) out.push({ icon: '🩺', text: `Few hospital beds — only ${Math.round(m.bedsBase * 100)}% of the usual stock.` });
  if (m.imports >= 4) out.push({ icon: '✈️', text: 'A gateway — infections keep arriving from outside.' });
  if (m.imports > 0 && m.imports < 4) out.push({ icon: '🚏', text: 'Some cases arrive from outside the district.' });
  if (m.economy >= 1.3) out.push({ icon: '📉', text: 'A fragile economy — closures gut the budget you need.' });
  if (m.economy <= 0.8) out.push({ icon: '💶', text: 'A resilient economy — closures barely dent the budget.' });
  if (m.funding >= 1.3) out.push({ icon: '💰', text: `Generously funded — ${pct(m.funding)} more budget each week.` });
  if (m.funding <= 0.8) out.push({ icon: '🪙', text: `Underfunded — ${pct(m.funding)} less budget each week.` });
  if (m.seasonality >= 0.3) out.push({ icon: '🌦️', text: 'A strong season — transmission swings hard over the outbreak.' });
  if (m.popScale >= 1.3) out.push({ icon: '👥', text: 'A very large district. Everything costs more.' });
  if (m.popScale <= 0.8) out.push({ icon: '👤', text: 'A small district. Everything costs less.' });
  return out;
}
