/**
 * Shared game state and the save file.
 *
 * `campaign` is the long game: which tiers are open, lifetime cash, every
 * tier's own floor (ticking a second at a time while it is open), and the
 * regional office network. `ui` is throwaway view state.
 */
const SAVE_KEY = 'gadget-factory-save-v1';
const BEST_KEY = 'gadget-factory-best-v1';

export const store = {
  campaign: null,
  ui: {
    view: 'title',      // title | tiers | floor | ops | help | shop
    tierId: null,
    notice: null,
    offlineReport: null,
    lastKey: null,
    showBonusShop: false,
    watchingAd: null,
  },
};

let renderFn = () => {};
export const onRender = (fn) => { renderFn = fn; };
export const render = () => renderFn();

export function save() {
  if (!store.campaign) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      version: 1,
      campaign: store.campaign,
      tierId: store.ui.tierId,
      view: store.ui.view === 'help' ? 'tiers' : store.ui.view,
      lastSeen: Date.now(),
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
    if (!(data?.version === 1 && data.campaign)) return null;
    return data;
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

export function recordBest(lifetimeCash) {
  try {
    if (lifetimeCash > bestScore()) localStorage.setItem(BEST_KEY, String(lifetimeCash));
  } catch { /* ignore */ }
}
