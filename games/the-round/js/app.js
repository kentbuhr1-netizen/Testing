/**
 * The Round — shell and router.
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
import * as bonusShopUi from './ui/bonusshop.js';
import { money, whole, clock, bar } from './ui/kit.js';
import { restockCost, spaceLeft } from './ops.js';
import * as Entitlements from './payments/client/entitlements.js';
import { PAYMENTS } from './payments.config.js';

const screenEl = document.getElementById('screen');
const actionsEl = document.getElementById('actions');
const hudEl = document.getElementById('hud');

const SCREENS = { ...mapUi.screens, ...opsUi.screens, ...bonusShopUi.screens };
const RUN_SCREENS = runUi.screens;
const ACTIONS = { ...mapUi.actions, ...runUi.actions, ...opsUi.actions, ...bonusShopUi.actions };

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function currentScreen() {
  // The bonus shop sits over whatever is current, so a mid-round boost lands where it is needed.
  if (store.ui.showBonusShop) return SCREENS.bonusShop;
  if (store.ui.view === 'run' && store.run) {
    // A worked day waiting to be read sits in front of the next forecast.
    if (store.ui.pending) return RUN_SCREENS.report;
    return RUN_SCREENS[store.run.phase] || RUN_SCREENS.forecast;
  }
  return SCREENS[store.ui.view] || SCREENS.title;
}

function screenKey() {
  if (store.ui.view === 'run' && store.run) {
    return `run:${store.ui.pending ? 'report' : store.run.phase}`;
  }
  return store.ui.view;
}

function draw() {
  const key = screenKey();
  const screen = currentScreen()();

  screenEl.innerHTML =
    (store.ui.notice ? `<div class="notice">${store.ui.notice}</div>` : '') + screen.body;
  store.ui.notice = null;
  actionsEl.innerHTML = screen.actions ?? '';
  actionsEl.hidden = !screen.actions;

  drawHud();

  // Replay the entrance animation only when the screen actually changed.
  if (store.ui.lastKey !== key) {
    screenEl.style.animation = 'none';
    void screenEl.offsetWidth;
    screenEl.style.animation = '';
    store.ui.lastKey = key;
    screenEl.scrollTop = 0;
    window.scrollTo(0, 0);
  }
  screen.mounted?.();
  save();
}

function drawHud() {
  const inRun = store.ui.view === 'run' && store.run;
  const showHud = inRun ||
    (store.campaign && ['world', 'town', 'round', 'ops', 'opsTown'].includes(store.ui.view));
  hudEl.hidden = !showHud;
  if (!showHud) return;

  if (inRun) {
    const r = store.run;
    const profit = r.money - r.stake;
    hudEl.innerHTML = `
      <div class="hud-item">
        <span class="hud-label">Day</span>
        <span class="hud-value">${Math.min(r.day, r.days)}/${r.days}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">Takings</span>
        <span class="hud-value">${money(r.money)}</span>
      </div>
      ${r.target != null
        ? `<div class="hud-item hud-goal">
             <span class="hud-label">Target ${whole(r.target)}</span>
             ${bar(profit / r.target, profit >= r.target ? 'bar-win' : '')}
           </div>`
        : `<div class="hud-item hud-goal">
             <span class="hud-label">Blade</span>
             ${bar(r.sharpness)}
           </div>`}`;
    return;
  }

  const progress = C.campaignProgress(store.campaign);
  hudEl.innerHTML = `
    <div class="hud-item">
      <span class="hud-label">Rounds</span>
      <span class="hud-value">${progress.rounds}</span>
    </div>
    <div class="hud-item">
      <span class="hud-label">Towns</span>
      <span class="hud-value">${progress.towns}/${progress.totalTowns}</span>
    </div>
    <div class="hud-item hud-goal">
      <span class="hud-label">Bank</span>
      <span class="hud-value">${whole(store.campaign.treasury)}</span>
    </div>`;
}

onRender(draw);

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Apply one tap of a stepper. Returns false when it could not move. */
function applyStep(group, field, step) {
  if (group !== 'order') return false;
  const next = Math.max(0, store.ui.order[field] + step);
  const trial = { ...store.ui.order, [field]: next };
  const yard = store.campaign.ops?.yards?.[store.ui.townId];
  if (!yard) return false;
  if (step > 0) {
    // An order may not outgrow the yard or the bank.
    if (trial.fuel + trial.blades > spaceLeft(yard)) return false;
    if (restockCost(trial) > store.campaign.treasury) return false;
  }
  store.ui.order[field] = next;
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
  handler(el, e);
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

/**
 * Work out what has been paid for before the first paint, so a player who
 * owns the game never sees a locked map flash past. An unconfigured build,
 * an offline start and a dead shop server all resolve to "carry on".
 */
Entitlements.configure(PAYMENTS);
try {
  await Entitlements.init();
} catch {
  /* never let the shop stop the game from starting */
}

// Always open on the title screen; Continue picks the saved game back up.
store.ui.view = 'title';
render();
