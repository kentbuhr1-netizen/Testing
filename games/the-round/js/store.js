/**
 * Shared game state and the save file.
 *
 * `campaign` is the long game (towns, rounds, the bank, the firm).
 * `run` is the season currently being worked, a day at a time.
 * `ui` is throwaway view state — which screen, the order being filled in.
 */
const SAVE_KEY = 'the-round-campaign-v1';
/**
 * Bumped when the day model changes enough that a saved career is describing
 * a different game. Progress is kept; anything measured against the old model
 * is thrown away and measured again.
 */
const SAVE_VERSION = 2;
const BEST_KEY = 'the-round-best-v1';

export const store = {
  campaign: null,
  run: null,
  ui: {
    view: 'title',      // title | world | town | round | run | ops | opsTown | help | shop
    townId: null,
    roundIndex: null,
    order: { fuel: 0, blades: 0 },
    pending: null,      // worked day awaiting its report
    opsReport: null,    // what the firm did while you were out
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
      version: SAVE_VERSION,
      campaign: store.campaign,
      run: store.run,
      view: store.ui.view === 'help' || store.ui.view === 'shop' ? 'world' : store.ui.view,
      townId: store.ui.townId,
      roundIndex: store.ui.roundIndex,
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
    if (!data?.campaign || !(data.version >= 1)) return null;

    if (data.version < SAVE_VERSION) {
      // A season saved before the round had a take-your-time list carries on
      // without one rather than throwing on the first render.
      if (data.run) {
        data.run.care = data.run.care || [];
        data.run.standing = data.run.standing ?? 1;
      }
      // Targets are a share of what the reference routers clear, so a target
      // cached under the old model is a bar from a game that no longer exists.
      // Rounds already held stay held; the rest are measured again on sight.
      data.campaign.targets = {};
      data.version = SAVE_VERSION;
    }
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

export function recordBest(amount) {
  try {
    if (amount > bestScore()) localStorage.setItem(BEST_KEY, String(amount));
  } catch { /* ignore */ }
}
