/**
 * Shared game state and the save file.
 *
 * `campaign` is the long game (cities, workshops, capital, the guild).
 * `run` is the commission currently being worked, a shift at a time.
 * `ui` is throwaway view state — which screen, the order being filled in.
 */
import { migrateCampaign } from './campaign.js';

const SAVE_KEY = 'the-forge-campaign-v1';
const BEST_KEY = 'the-forge-best-v1';

export const store = {
  campaign: null,
  run: null,
  ui: {
    view: 'title',      // title | world | city | workshop | run | guild | guildCity | help
    cityId: null,
    workshopIndex: null,
    barOrder: 0,        // bar stock being ordered into a depot
    pending: null,      // worked shift awaiting its report
    guildReport: null,  // what the guild did while you were at the anvil
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
      cityId: store.ui.cityId,
      workshopIndex: store.ui.workshopIndex,
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
    // Hand swings are banked for one shift only and never saved as anything
    // else; a run written by an older build may not carry the field at all.
    if (data.run && typeof data.run.hands !== 'number') data.run.hands = 0;
    // Targets cached against an older model are honest numbers for a game that
    // no longer exists. Drop them; each workshop is re-measured when offered.
    data.migrated = migrateCampaign(data.campaign);
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

export function recordBest(pieces) {
  try {
    if (pieces > bestScore()) localStorage.setItem(BEST_KEY, String(pieces));
  } catch { /* ignore */ }
}
