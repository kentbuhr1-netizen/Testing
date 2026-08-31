/**
 * Lemonade Stand — shell and router.
 *
 * Screens live in js/ui/*. Each exports `screens` (view name → function
 * returning { body, actions, mounted }) and `actions` (button name → handler).
 * This file owns the DOM, the HUD, input, and saving after every action.
 */
import { store, onRender, render, save } from './store.js';
import * as C from './campaign.js';
import * as S from './sim.js';
import * as mapUi from './ui/map.js';
import * as runUi from './ui/run.js';
import * as opsUi from './ui/opsui.js';
import { money, whole, bar } from './ui/kit.js';
import { restockCost, spaceLeft } from './ops.js';

const screenEl = document.getElementById('screen');
const actionsEl = document.getElementById('actions');
const hudEl = document.getElementById('hud');

const SCREENS = { ...mapUi.screens, ...opsUi.screens };
const RUN_SCREENS = runUi.screens;
const ACTIONS = { ...mapUi.actions, ...runUi.actions, ...opsUi.actions };

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function currentScreen() {
  if (store.ui.view === 'run' && store.run) {
    return RUN_SCREENS[store.run.phase] || RUN_SCREENS.forecast;
  }
  return SCREENS[store.ui.view] || SCREENS.title;
}

function draw() {
  const view = store.ui.view === 'run' && store.run ? `run:${store.run.phase}` : store.ui.view;
  const screen = currentScreen()();

  screenEl.innerHTML = (store.ui.notice ? `<div class="notice">${store.ui.notice}</div>` : '') + screen.body;
  store.ui.notice = null;
  actionsEl.innerHTML = screen.actions ?? '';
  actionsEl.hidden = !screen.actions;

  drawHud();

  // Replay the entrance animation only when the screen actually changed.
  if (store.ui.lastKey !== view) {
    screenEl.style.animation = 'none';
    void screenEl.offsetWidth;
    screenEl.style.animation = '';
    store.ui.lastKey = view;
    screenEl.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  screen.mounted?.();
  save();
}

function drawHud() {
  const inRun = store.ui.view === 'run' && store.run;
  const showHud = inRun || (store.campaign && ['world', 'city', 'corner', 'ops', 'opsCity'].includes(store.ui.view));
  hudEl.hidden = !showHud;
  if (!showHud) return;

  if (inRun) {
    const r = store.run;
    const pending = store.ui.pending ? store.ui.pending.revenue : 0;
    const cash = r.money + pending;
    const profit = cash - r.stake;
    hudEl.innerHTML = `
      <div class="hud-item">
        <span class="hud-label">Day</span>
        <span class="hud-value">${Math.min(r.day, r.days)}/${r.days}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">Cash</span>
        <span class="hud-value">${money(cash)}</span>
      </div>
      ${r.target != null
        ? `<div class="hud-item hud-goal">
             <span class="hud-label">Target ${whole(r.target)}</span>
             ${bar(profit / r.target, profit >= r.target ? 'bar-win' : '')}
           </div>`
        : `<div class="hud-item hud-goal">
             <span class="hud-label">Reputation</span>
             ${bar(r.reputation)}
           </div>`}`;
    return;
  }

  const progress = C.campaignProgress(store.campaign);
  hudEl.innerHTML = `
    <div class="hud-item">
      <span class="hud-label">Corners</span>
      <span class="hud-value">${progress.corners}</span>
    </div>
    <div class="hud-item">
      <span class="hud-label">Cities</span>
      <span class="hud-value">${progress.cities}/${progress.totalCities}</span>
    </div>
    <div class="hud-item hud-goal">
      <span class="hud-label">Treasury</span>
      <span class="hud-value">${whole(store.campaign.treasury)}</span>
    </div>`;
}

onRender(draw);

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const LIMITS = {
  recipe: { lemons: [1, 12], sugar: [1, 12], ice: [0, 7] },
  price: { price: [0.05, 5] },
  order: { lemons: [0, 9999], sugar: [0, 9999], ice: [0, 9999], cups: [0, 9999] },
  restock: { lemons: [0, 99999], sugar: [0, 99999], cups: [0, 99999] },
};

/** Apply one tap of a stepper. Returns false when it could not move. */
function applyStep(group, field, step) {
  const [min, max] = LIMITS[group][field];
  const r = store.run;

  if (group === 'order') {
    const next = clamp(store.ui.order[field] + step, min, max);
    const trial = { ...store.ui.order, [field]: next };
    if (step > 0 && S.buyCost(r.today.prices, trial) > r.money) return false; // never overspend
    store.ui.order[field] = next;
    return true;
  }
  if (group === 'restock') {
    const next = clamp(store.ui.restock[field] + step, min, max);
    const trial = { ...store.ui.restock, [field]: next };
    return acceptRestock(trial, field, next);
  }
  if (group === 'price') {
    r.price = Math.round(clamp(r.price + step, min, max) * 100) / 100;
    return true;
  }
  r.recipe[field] = clamp(r.recipe[field] + step, min, max);
  return true;
}

/** An order may not outgrow the depot or the treasury. */
function acceptRestock(trial, field, next) {
  const depot = store.campaign.ops?.warehouses?.[store.ui.cityId];
  if (!depot) return false;
  const units = trial.lemons + trial.sugar + trial.cups;
  if (units > spaceLeft(depot)) return false;
  if (restockCost(trial) > store.campaign.treasury) return false;
  store.ui.restock[field] = next;
  return true;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;

  if (act === 'step') {
    if (applyStep(el.dataset.group, el.dataset.field, Number(el.dataset.step))) render();
    return;
  }
  const handler = ACTIONS[act];
  if (!handler) return;
  handler(el);
  render();
});

/* Press and hold a stepper to run the number up quickly. */
let holdTimer = null;
let holdRepeat = null;

function stopHold() {
  clearTimeout(holdTimer);
  clearInterval(holdRepeat);
  holdTimer = holdRepeat = null;
}

document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-act="step"]');
  if (!el || el.disabled) return;
  const { group, field } = el.dataset;
  const step = Number(el.dataset.step);
  holdTimer = setTimeout(() => {
    holdRepeat = setInterval(() => {
      if (applyStep(group, field, step)) render();
      else stopHold();
    }, 80);
  }, 400);
});

for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(evt, stopHold);
}

/* Steppers repeat on hold; a stray double-tap should not zoom the page. */
document.addEventListener('dblclick', (e) => e.preventDefault());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// Always open on the title screen; Continue picks the saved game back up.
store.ui.view = 'title';
render();
