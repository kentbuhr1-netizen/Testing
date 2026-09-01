/**
 * Shared game state and the save file.
 *
 * `campaign` is the long game (cities, corners, treasury, supply chain).
 * `run` is the stretch of days currently being played on one corner.
 * `ui` is throwaway view state — which screen, the basket being filled in.
 */
import { ENHANCERS } from './sim.js';

const SAVE_KEY = 'lemonade-stand-campaign-v2';
const BEST_KEY = 'lemonade-stand-best-v1';
const PREMIUM_KEY = 'lemonade-stand-premium-v1';

const zeroedEnhancers = () => Object.fromEntries(Object.keys(ENHANCERS).map((id) => [id, 0]));

export const store = {
  campaign: null,
  run: null,
  ui: {
    view: 'title',      // title | world | city | corner | run | ops | opsCity | help
    cityId: null,
    cornerIndex: null,
    order: { lemons: 0, sugar: 0, ice: 0, cups: 0, enhancers: zeroedEnhancers() },
    restock: { lemons: 0, sugar: 0, cups: 0 },
    pending: null,      // simulated day awaiting its report
    opsReport: null,    // what the network did while you were working
    editingTruck: null, // id of the truck whose route is being set, or null
    truckDraft: null,   // { from, to, cargo, amount } while editingTruck is set
    showPremium: false, // the never-expire paywall screen, shown over whatever's current
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
