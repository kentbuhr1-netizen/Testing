/**
 * Gadget Factory — the product ladder.
 *
 * Five tiers, each its own product line, each its own machine catalog. A
 * tier's prestige threshold is not a number someone guessed: it is a share of
 * what a well-informed reference player finds achievable in one realistic
 * session — thirty minutes of tapping, then four hours left running — on
 * that tier's exact economy, starting with the lifetime cash a player would
 * plausibly be carrying in from the tier before it. Chaining the tiers that
 * way is what keeps a spacecraft factory from asking for a bicycle-factory
 * number.
 */
import { playReference, newRun } from './sim.js';

/** Share of one full reference session a tier's threshold is set to. */
const FIRST_PRESTIGE_SHARE = 0.15;

const draft = (id, name, icon, blurb, { baseGrid, basePrice, upgradeBaseCost, machines }) => ({
  id, name, icon, blurb, baseGrid, basePrice, upgradeBaseCost, machines,
});

/**
 * The five product lines, gentlest to hardest. Costs and rates climb by
 * roughly two orders of magnitude a tier — the same "number goes up faster"
 * curve prestige itself uses, just laid out catalog to catalog instead of
 * run to run.
 */
const DRAFTS = [
  draft('bicycles', 'Bicycles', '🚲', 'A garage, a welder, and a dream of frames that do not crack.', {
    baseGrid: 20, basePrice: 1,
    upgradeBaseCost: { tap: 15, speed: 40, price: 60, grid: 100 },
    machines: [
      { id: 'welder', name: 'Welding Jig', icon: '🔧', baseCost: 25, baseRate: 0.5 },
      { id: 'painter', name: 'Paint Booth', icon: '🎨', baseCost: 150, baseRate: 3 },
      { id: 'assembler', name: 'Assembly Bench', icon: '⚙️', baseCost: 900, baseRate: 15 },
    ],
  }),
  draft('scooters', 'Scooters & Mopeds', '🛵', 'The workshop outgrew the garage two years ago and still runs like it.', {
    baseGrid: 25, basePrice: 1.2,
    upgradeBaseCost: { tap: 200, speed: 600, price: 900, grid: 1500 },
    machines: [
      { id: 'framejig', name: 'Frame Jig', icon: '🔩', baseCost: 400, baseRate: 6 },
      { id: 'motorwinder', name: 'Motor Winder', icon: '🧵', baseCost: 2500, baseRate: 35 },
      { id: 'finalcheck', name: 'Final Check Line', icon: '✅', baseCost: 15000, baseRate: 180 },
    ],
  }),
  draft('cars', 'Cars', '🚗', 'Robots on the heavy stations; people everywhere the robots cannot go.', {
    baseGrid: 30, basePrice: 1.5,
    upgradeBaseCost: { tap: 3000, speed: 9000, price: 14000, grid: 22000 },
    machines: [
      { id: 'stampingpress', name: 'Stamping Press', icon: '🏗️', baseCost: 6000, baseRate: 80 },
      { id: 'paintline', name: 'Paint Line', icon: '🎨', baseCost: 38000, baseRate: 500 },
      { id: 'roboticarm', name: 'Robotic Arm', icon: '🤖', baseCost: 230000, baseRate: 2800 },
    ],
  }),
  draft('drones', 'Drones', '🛸', 'Every unit is a small research project that also has to ship on time.', {
    baseGrid: 35, basePrice: 2,
    upgradeBaseCost: { tap: 45000, speed: 130000, price: 210000, grid: 340000 },
    machines: [
      { id: 'circuitetcher', name: 'Circuit Etcher', icon: '🖨️', baseCost: 90000, baseRate: 1100 },
      { id: 'motorassembly', name: 'Motor Assembly', icon: '🌀', baseCost: 560000, baseRate: 7200 },
      { id: 'firmwarerig', name: 'Firmware Rig', icon: '💾', baseCost: 3400000, baseRate: 42000 },
    ],
  }),
  draft('spacecraft', 'Spacecraft', '🚀', 'Win this and the company’s name is on something that leaves the atmosphere.', {
    baseGrid: 40, basePrice: 3,
    upgradeBaseCost: { tap: 700000, speed: 2000000, price: 3200000, grid: 5200000 },
    machines: [
      { id: 'hulllathe', name: 'Hull Lathe', icon: '🛠️', baseCost: 1400000, baseRate: 17000 },
      { id: 'thrustertest', name: 'Thruster Test Stand', icon: '🔥', baseCost: 8700000, baseRate: 110000 },
      { id: 'launchprep', name: 'Launch Prep Bay', icon: '🌌', baseCost: 52000000, baseRate: 640000 },
    ],
  }),
];

/**
 * Chain the reference bot tier to tier, feeding each one the lifetime cash a
 * player who prestiged straight through the earlier tiers would be carrying,
 * so a later tier's bar reflects the multiplier a player actually has by
 * then rather than assuming they arrive with nothing.
 */
function buildTiers() {
  let lifetime = 0;
  const out = [];
  for (const d of DRAFTS) {
    const solo = playReference({ ...d, prestigeThreshold: Infinity }, lifetime);
    const prestigeThreshold = Math.max(1, Math.round(solo * FIRST_PRESTIGE_SHARE));
    out.push({ ...d, prestigeThreshold });
    lifetime = solo;
  }
  return out;
}

export const TIERS = buildTiers();
export const TIER_INDEX = Object.fromEntries(TIERS.map((t, i) => [t.id, i]));
export const getTier = (id) => TIERS[TIER_INDEX[id]];

export const TIERS_FOR_OPS = 2;   // regional offices unlock once this many tiers have a first prestige
/** Share of a prestige's earnings banked into the treasury, which funds regional offices. */
export const TREASURY_SHARE_OF_PRESTIGE = 0.03;

/* ------------------------------------------------------------------ *
 * Campaign state
 * ------------------------------------------------------------------ */

export function newCampaign() {
  return {
    version: 1,
    tier: 0,               // which product line the player is actively working
    lifetimeCash: 0,        // carries a tier's prestige multiplier forward
    prestigesByTier: TIERS.map(() => 0),
    unlockedTiers: 1,        // how many tiers are open to switch into
    floors: {},               // tierId → live sim state for that tier's floor
    ops: null,                 // built by ops.js once two tiers have a first prestige
    treasury: 0,                 // cash banked for buying components / building offices
    stats: { totalPrestiges: 0, bestLifetimeCash: 0 },
  };
}

export const isTierUnlocked = (campaign, tierIndex) => tierIndex < campaign.unlockedTiers;

/** The live floor for a tier, created fresh the first time it is opened. */
export function getFloor(campaign, tierId) {
  if (!campaign.floors[tierId]) campaign.floors[tierId] = newRun();
  return campaign.floors[tierId];
}

/** A prestige on any tier banks lifetime cash and may open the next tier. */
export function recordPrestige(campaign, tierIndex, earnedThisRun) {
  campaign.lifetimeCash = Math.round((campaign.lifetimeCash + earnedThisRun) * 100) / 100;
  campaign.treasury = Math.round((campaign.treasury + earnedThisRun * TREASURY_SHARE_OF_PRESTIGE) * 100) / 100;
  campaign.prestigesByTier[tierIndex] += 1;
  campaign.stats.totalPrestiges += 1;
  campaign.stats.bestLifetimeCash = Math.max(campaign.stats.bestLifetimeCash, campaign.lifetimeCash);

  const justUnlocked = tierIndex === campaign.unlockedTiers - 1 && tierIndex + 1 < TIERS.length;
  if (justUnlocked) campaign.unlockedTiers += 1;

  return {
    tierJustUnlocked: justUnlocked,
    opsJustUnlocked: campaign.unlockedTiers - 1 === TIERS_FOR_OPS,
  };
}

export const opsUnlocked = (campaign) => campaign.unlockedTiers - 1 >= TIERS_FOR_OPS;

export function campaignProgress(campaign) {
  return {
    unlockedTiers: campaign.unlockedTiers,
    totalTiers: TIERS.length,
    totalPrestiges: campaign.stats.totalPrestiges,
    lifetimeCash: campaign.lifetimeCash,
  };
}
