/**
 * Shared game state and the save file.
 *
 * `campaign` is the long game (regions, districts, treasury, the agency).
 * `run` is the outbreak currently being worked, a week at a time.
 * `ui` is throwaway view state — which screen, the order being filled in.
 */
const SAVE_KEY = 'outbreak-campaign-v1';
const BEST_KEY = 'outbreak-best-v1';

export const store = {
  campaign: null,
  run: null,
  ui: {
    view: 'title',      // title | world | region | district | run | ops | opsRegion | help
    regionId: null,
    districtIndex: null,
    doseOrder: 0,       // doses being ordered into a lab
    pending: null,      // simulated week awaiting its report
    opsReport: null,    // what the agency did while you were working
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
      view: store.ui.view === 'help' ? 'world' : store.ui.view,
      regionId: store.ui.regionId,
      districtIndex: store.ui.districtIndex,
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
    // A run saved before wards carried a staffing bill has no bed stock to
    // staff. Without this the first committed week adds to `undefined`.
    if (data.run && typeof data.run.builtBeds !== 'number') data.run.builtBeds = 0;
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

export function recordBest(lives) {
  try {
    if (lives > bestScore()) localStorage.setItem(BEST_KEY, String(lives));
  } catch { /* ignore */ }
}
