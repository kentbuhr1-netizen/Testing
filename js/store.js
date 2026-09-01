/**
 * Shared game state and the save file.
 *
 * `campaign` is the long game (cities, corners, treasury, supply chain).
 * `run` is the stretch of days currently being played on one corner.
 * `ui` is throwaway view state — which screen, the basket being filled in.
 */
import { ENHANCERS } from './sim.js';
import { getCity, completedCities, CITIES } from './campaign.js';
import { ACHIEVEMENTS, evaluateAchievements } from './achievements.js';

const SAVE_KEY = 'lemonade-stand-campaign-v2';
const BEST_KEY = 'lemonade-stand-best-v1';
const PREMIUM_KEY = 'lemonade-stand-premium-v1';
const STATS_KEY = 'lemonade-stand-stats-v1';
const ACHIEVEMENTS_KEY = 'lemonade-stand-achievements-v1';
const TUTORIAL_KEY = 'lemonade-stand-tutorial-seen-v1';

const zeroedEnhancers = () => Object.fromEntries(Object.keys(ENHANCERS).map((id) => [id, 0]));

export const store = {
  campaign: null,
  run: null,
  ui: {
    view: 'title',      // title | world | city | corner | run | ops | opsCity | help
    cityId: null,
    cornerIndex: null,
    order: { lemons: 0, sugar: 0, ice: 0, cups: 0, cupsSmall: 0, cupsLarge: 0, enhancers: zeroedEnhancers() },
    restock: { lemons: 0, sugar: 0, cups: 0 },
    pending: null,      // simulated day awaiting its report
    opsReport: null,    // what the network did while you were working
    editingTruck: null, // id of the truck whose route is being set, or null
    truckDraft: null,   // { from, to, cargo, amount } while editingTruck is set
    showPremium: false,      // the never-expire paywall screen, shown over whatever's current
    showAchievements: false, // the achievements list, shown over whatever's current
    showTutorial: false,     // the first-time welcome sequence
    tutorialStep: 0,
    lastKey: null,
    notice: null,
  },
};

let renderFn = () => {};
export const onRender = (fn) => { renderFn = fn; };
export const render = () => renderFn();

export function save() {
  if (!store.campaign) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 2,
      campaign: store.campaign,
      run: store.run,
      view: store.ui.view === 'help' ? 'world' : store.ui.view,
      cityId: store.ui.cityId,
      cornerIndex: store.ui.cornerIndex,
    }));
  } catch {
    /* private mode or a full quota: the game still plays, it just won't resume */
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data?.version === 2 && data.campaign ? data : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

export function bestScore() {
  const n = Number(localStorage.getItem(BEST_KEY));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function recordBest(amount) {
  try {
    if (amount > bestScore()) localStorage.setItem(BEST_KEY, String(amount));
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ *
 * Premium unlocks
 *
 * There is no payment processor wired into this game — it's a static page
 * with no server. This is the hook a real one would plug into: the paywall
 * screen is real and the mechanic it unlocks is real, but the "purchase"
 * button here just flips a local flag rather than charging anyone. Shipping
 * this for real would mean wiring it to App Store / Play Store IAP, or
 * Stripe for a web build, behind this exact same call.
 * ------------------------------------------------------------------ */

function loadPremium() {
  try {
    return JSON.parse(localStorage.getItem(PREMIUM_KEY)) || {};
  } catch {
    return {};
  }
}

export function isPremiumUnlocked(flag) {
  return Boolean(loadPremium()[flag]);
}

/** Flips the flag locally. Not a real purchase — see the note above. */
export function unlockPremiumDemo(flag) {
  try {
    const current = loadPremium();
    current[flag] = true;
    localStorage.setItem(PREMIUM_KEY, JSON.stringify(current));
  } catch {
    /* private mode or a full quota — the unlock just won't stick around */
  }
}

/* ------------------------------------------------------------------ *
 * Tutorial
 * ------------------------------------------------------------------ */

export function hasTutorialBeenSeen() {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return true; // if storage is unavailable, don't force it on every load
  }
}

export function markTutorialSeen() {
  try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ *
 * Lifetime stats and achievements
 *
 * A handful of numbers persist across every campaign and every free-play
 * season — total cups sold, total days played, the most cash ever held —
 * since a fresh campaign or a cleared save shouldn't erase what you've
 * actually accomplished. Everything else an achievement needs (corners,
 * cities, buildings, trucks) is read fresh from the current campaign, so
 * there's nothing to keep in sync by hand.
 * ------------------------------------------------------------------ */

const STATS_DEFAULTS = {
  cupsSoldEver: 0, daysPlayed: 0, peakCash: 0,
  smallSoldEver: 0, largeSoldEver: 0, byoSoldEver: 0, enhancersSoldEver: 0,
  tiersWon: [],
};

function loadStats() {
  try {
    return { ...STATS_DEFAULTS, ...(JSON.parse(localStorage.getItem(STATS_KEY)) || {}) };
  } catch {
    return { ...STATS_DEFAULTS };
  }
}

function saveStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch { /* ignore */ }
}

/** Call once per day committed, in any run — campaign or free play. */
export function recordDay(result, cashNow) {
  const stats = loadStats();
  stats.cupsSoldEver += result.sold;
  stats.daysPlayed += 1;
  stats.peakCash = Math.max(stats.peakCash, cashNow || 0);
  const sizes = result.sizes || {};
  stats.smallSoldEver += sizes.small?.sold || 0;
  stats.largeSoldEver += sizes.large?.sold || 0;
  stats.byoSoldEver += sizes.byo?.sold || 0;
  stats.enhancersSoldEver += Object.values(result.enhancers || {}).reduce((n, s) => n + s.cups, 0);
  saveStats(stats);
}

/** Call once a corner is claimed, so "win every tier" can be checked later. */
export function recordTierWon(tier) {
  if (!tier) return;
  const stats = loadStats();
  if (!stats.tiersWon.includes(tier)) {
    stats.tiersWon.push(tier);
    saveStats(stats);
  }
}

export function loadUnlockedAchievements() {
  try {
    return JSON.parse(localStorage.getItem(ACHIEVEMENTS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveUnlockedAchievements(map) {
  try { localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
}

/**
 * Re-checks every achievement against the current state of the world.
 * `extra` carries the handful of facts that only exist for a moment — how a
 * day just went, whether a run just finished clean — everything else is
 * read fresh from the campaign so calling this after any state change is
 * always safe. Returns the ids that newly unlocked, for a toast.
 */
export function checkAchievements(extra = {}) {
  const stats = loadStats();
  const campaign = store.campaign;
  const claimed = campaign?.claimed || {};
  const cornersClaimed = Object.values(claimed).reduce((n, list) => n + list.length, 0);
  const claimedCityIds = Object.keys(claimed).filter((id) => (claimed[id] || []).length > 0);
  const regions = claimedCityIds.map((id) => getCity(id).region);
  const buildings = campaign?.ops?.buildings || {};
  const allBuildingsInOneCity = Object.values(buildings).some((b) => Object.values(b).filter(Boolean).length >= 4);
  const citiesFullyBuilt = Object.values(buildings).filter((b) => Object.values(b).filter(Boolean).length >= 4).length;
  const anyBuildingBuilt = Object.values(buildings).some((b) => Object.values(b).filter(Boolean).length >= 1);
  const trucksCount = campaign?.ops?.trucks?.length || 0;
  const currentCash = store.run ? store.run.money : (campaign?.treasury || 0);

  const ctx = {
    cupsSoldEver: stats.cupsSoldEver,
    daysPlayed: stats.daysPlayed,
    peakMoney: Math.max(stats.peakCash, currentCash),
    cornersClaimed,
    citiesClaimed: campaign ? completedCities(campaign).length : 0,
    totalCities: CITIES.length,
    hasUSCorner: regions.includes('US'),
    hasEUCorner: regions.includes('EU'),
    allBuildingsInOneCity,
    citiesFullyBuilt,
    anyBuildingBuilt,
    trucksBought: trucksCount >= 1,
    trucksCount,
    treasury: campaign?.treasury || 0,
    smallSoldEver: stats.smallSoldEver,
    largeSoldEver: stats.largeSoldEver,
    byoSoldEver: stats.byoSoldEver,
    enhancersSoldEver: stats.enhancersSoldEver,
    tiersWon: stats.tiersWon,
    neverExpireLemons: isPremiumUnlocked('neverExpireLemons'),
    ...extra,
  };

  const unlocked = loadUnlockedAchievements();
  const newly = evaluateAchievements(ctx, unlocked);
  if (newly.length) {
    const now = Date.now();
    for (const id of newly) unlocked[id] = { at: now };
    saveUnlockedAchievements(unlocked);
  }
  return newly;
}

/** A one-line notice for whatever checkAchievements() just returned, or null. */
export function achievementToast(newlyUnlockedIds) {
  if (!newlyUnlockedIds || newlyUnlockedIds.length === 0) return null;
  if (newlyUnlockedIds.length === 1) {
    return `🏅 Achievement unlocked: ${ACHIEVEMENTS[newlyUnlockedIds[0]].title}!`;
  }
  return `🏅 ${newlyUnlockedIds.length} achievements unlocked: ${newlyUnlockedIds.map((id) => ACHIEVEMENTS[id].title).join(', ')}!`;
}
