/**
 * The Forge — shell and router.
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
import * as guildUi from './ui/guildui.js';
import * as bonusShopUi from './ui/bonusshop.js';
import { money, count, bar } from './ui/kit.js';
import { wholesaleCost, spaceLeft } from './ops.js';
import * as Entitlements from './payments/client/entitlements.js';
import { PAYMENTS } from './payments.config.js';

const screenEl = document.getElementById('screen');
const actionsEl = document.getElementById('actions');
const hudEl = document.getElementById('hud');

const SCREENS = { ...mapUi.screens, ...guildUi.screens, ...bonusShopUi.screens };
const RUN_SCREENS = runUi.screens;
const ACTIONS = { ...mapUi.actions, ...runUi.actions, ...guildUi.actions, ...bonusShopUi.actions };

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function currentScreen() {
  // The bonus shop sits over whatever is current, so a mid-commission boost lands where it is needed.
  if (store.ui.showBonusShop) return SCREENS.bonusShop;
  if (store.ui.view === 'run' && store.run) {
    // A worked shift waiting to be read sits in front of the next briefing.
    if (store.ui.pending) return RUN_SCREENS.report;
    return RUN_SCREENS[store.run.phase] || RUN_SCREENS.briefing;
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
    (store.campaign && ['world', 'city', 'workshop', 'guild', 'guildCity'].includes(store.ui.view));
  hudEl.hidden = !showHud;
  if (!showHud) return;

  if (inRun) {
    const r = store.run;
    hudEl.innerHTML = `
      <div class="hud-item">
        <span class="hud-label">Shift</span>
        <span class="hud-value">${Math.min(r.shift, r.shifts)}/${r.shifts}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">Purse</span>
        <span class="hud-value">${money(r.coin)}</span>
      </div>
      ${r.target != null
        ? `<div class="hud-item hud-goal">
             <span class="hud-label">Made ${count(r.pieces)} / ${count(r.target)}</span>
             ${bar(r.pieces / r.target, r.pieces >= r.target ? 'bar-win' : '')}
           </div>`
        : `<div class="hud-item hud-goal">
             <span class="hud-label">Morale</span>
             ${bar(r.morale)}
           </div>`}`;
    return;
  }

  const progress = C.campaignProgress(store.campaign);
  hudEl.innerHTML = `
    <div class="hud-item">
      <span class="hud-label">Workshops</span>
      <span class="hud-value">${progress.workshops}</span>
    </div>
    <div class="hud-item">
      <span class="hud-label">Cities</span>
      <span class="hud-value">${progress.cities}/${progress.totalCities}</span>
    </div>
    <div class="hud-item hud-goal">
      <span class="hud-label">Capital</span>
      <span class="hud-value">${money(store.campaign.capital)}</span>
    </div>`;
}

onRender(draw);

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Apply one tap of a stepper. Returns false when it could not move. */
function applyStep(group, field, step) {
  if (group === 'levels') {
    const r = store.run;
    const next = clamp(r.levels[field] + step, 0, S.LEVER_MAX[field]);
    const trial = { ...r.levels, [field]: next };
    // Never let the player commit money the shop does not have.
    if (step > 0 && S.shiftSpend(trial, r) > r.coin) return false;
    r.levels[field] = next;
    return true;
  }
  if (group === 'barOrder') {
    return acceptBarOrder(store.ui.barOrder + step);
  }
  return false;
}

/** An order may not outgrow the depot or the capital. */
function acceptBarOrder(next) {
  const depot = store.campaign.guild?.depots?.[store.ui.cityId];
  if (!depot) return false;
  const wanted = Math.max(0, next);
  if (wanted > spaceLeft(depot)) return false;
  if (wholesaleCost(wanted) > store.campaign.capital) return false;
  store.ui.barOrder = wanted;
  return true;
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;

  // The anvil handles its own taps, straight to the DOM — a clicker that
  // repaints the whole screen on every swing is a clicker nobody wants.
  if (act === 'noop') return;

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

/* Steppers and the anvil both repeat on hold; a stray double-tap should not zoom. */
document.addEventListener('dblclick', (e) => e.preventDefault());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/**
 * Work out what has been paid for before the first paint, so a player who
 * owns the game never sees a locked world flash past. An unconfigured build,
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
