/**
 * Shared game state and the save file.
 *
 * `campaign` is the long game (cities, corners, treasury, supply chain).
 * `run` is the stretch of days currently being played on one corner.
 * `ui` is throwaway view state — which screen, the basket being filled in.
 */
const SAVE_KEY = 'lemonade-stand-campaign-v2';
const BEST_KEY = 'lemonade-stand-best-v1';

export const store = {
  campaign: null,
  run: null,
  ui: {
    view: 'title',      // title | world | city | corner | run | ops | opsCity | help
    cityId: null,
    cornerIndex: null,
    order: { lemons: 0, sugar: 0, ice: 0, cups: 0 },
    restock: { lemons: 0, sugar: 0, cups: 0 },
    pending: null,      // simulated day awaiting its report
    opsReport: null,    // what the network did while you were working
    editingTruck: null, // id of the truck whose route is being set, or null
    truckDraft: null,   // { from, to, cargo, amount } while editingTruck is set
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
