/**
 * Outbreak — shell and router.
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
import { money, lives, bar } from './ui/kit.js';
import { wholesaleCost, spaceLeft } from './ops.js';

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
    // A committed week waiting to be read sits in front of the next briefing.
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
    (store.campaign && ['world', 'region', 'district', 'ops', 'opsRegion'].includes(store.ui.view));
  hudEl.hidden = !showHud;
  if (!showHud) return;

  if (inRun) {
    const r = store.run;
    const saved = S.savedSoFar(r);
    hudEl.innerHTML = `
      <div class="hud-item">
        <span class="hud-label">Week</span>
        <span class="hud-value">${Math.min(r.week, r.weeks)}/${r.weeks}</span>
      </div>
      <div class="hud-item">
        <span class="hud-label">Budget</span>
        <span class="hud-value">${money(r.funds)}</span>
      </div>
      ${r.target != null
        ? `<div class="hud-item hud-goal">
             <span class="hud-label">Saved ${lives(saved)} / ${lives(r.target)}</span>
             ${bar(saved / r.target, saved >= r.target ? 'bar-win' : '')}
           </div>`
        : `<div class="hud-item hud-goal">
             <span class="hud-label">Compliance</span>
             ${bar(r.compliance)}
           </div>`}`;
    return;
  }

  const progress = C.campaignProgress(store.campaign);
  hudEl.innerHTML = `
    <div class="hud-item">
      <span class="hud-label">Districts</span>
      <span class="hud-value">${progress.districts}</span>
    </div>
    <div class="hud-item">
      <span class="hud-label">Regions</span>
      <span class="hud-value">${progress.regions}/${progress.totalRegions}</span>
    </div>
    <div class="hud-item hud-goal">
      <span class="hud-label">Budget</span>
      <span class="hud-value">${money(store.campaign.treasury)}</span>
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
    const next = clamp(r.levels[field] + step, 0, S.MAX_LEVEL);
    const trial = { ...r.levels, [field]: next };
    // Never let the player commit money the district does not have.
    if (step > 0 && S.weeklySpend(trial, r.pop) > r.funds) return false;
    r.levels[field] = next;
    return true;
  }
  if (group === 'doseOrder') {
    return acceptDoseOrder(store.ui.doseOrder + step);
  }
  return false;
}

/** An order may not outgrow the laboratory or the budget. */
function acceptDoseOrder(next) {
  const lab = store.campaign.ops?.labs?.[store.ui.regionId];
  if (!lab) return false;
  const wanted = Math.max(0, next);
  if (wanted > spaceLeft(lab)) return false;
  if (wholesaleCost(wanted) > store.campaign.treasury) return false;
  store.ui.doseOrder = wanted;
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
