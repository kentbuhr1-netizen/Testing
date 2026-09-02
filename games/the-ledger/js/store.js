/**
 * Shared game state and the save file.
 *
 * `campaign` is the long game (towns, books, the bank, the network).
 * `run` is the book currently being worked, a week at a time.
 * `ui` is throwaway view state — which screen, the shipment being filled in.
 */
const SAVE_KEY = 'the-ledger-campaign-v1';
const BEST_KEY = 'the-ledger-best-v1';

export const store = {
  campaign: null,
  run: null,
  ui: {
    view: 'title',      // title | world | town | book | run | ops | opsTown | help | shop
    townId: null,
    bookIndex: null,
    shipment: { cash: 0 },
    pending: null,      // settled week awaiting its report
    lastDecision: null, // the file just answered, so the desk can confirm it
    opsReport: null,    // what the network did while you were out
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
      version: 1,
      campaign: store.campaign,
      run: store.run,
      view: store.ui.view === 'help' || store.ui.view === 'shop' ? 'world' : store.ui.view,
      townId: store.ui.townId,
      bookIndex: store.ui.bookIndex,
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
    return data?.version === 1 && data.campaign ? data : null;
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
