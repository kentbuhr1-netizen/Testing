/**
 * Gadget Factory — shell and router.
 *
 * Screens live in js/ui/*. Each exports `screens` (view name → function
 * returning { body, actions, mounted }) and `actions` (button name → handler).
 * This file owns the DOM, the HUD, input, the once-a-second idle tick, and
 * saving after every action.
 */
import { store, onRender, render, save } from './store.js';
import * as C from './campaign.js';
import * as S from './sim.js';
import * as mapUi from './ui/map.js';
import * as runUi from './ui/run.js';
import * as opsUi from './ui/opsui.js';
import * as bonusShopUi from './ui/bonusshop.js';
import { money } from './ui/kit.js';
import { spaceLeft, wholesaleCost } from './ops.js';
import * as Entitlements from './payments/client/entitlements.js';
import { PAYMENTS } from './payments.config.js';

const screenEl = document.getElementById('screen');
const actionsEl = document.getElementById('actions');
const hudEl = document.getElementById('hud');

const SCREENS = { ...mapUi.screens, ...runUi.screens, ...opsUi.screens, ...bonusShopUi.screens };
const ACTIONS = { ...mapUi.actions, ...runUi.actions, ...opsUi.actions, ...bonusShopUi.actions };

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function currentScreen() {
  if (store.ui.showBonusShop) return SCREENS.bonusShop;
  return SCREENS[store.ui.view] || SCREENS.title;
}

function draw() {
  const key = store.ui.showBonusShop ? 'bonusShop' : store.ui.view;
  const screen = currentScreen()();

  screenEl.innerHTML =
    (store.ui.notice ? `<div class="notice">${store.ui.notice}</div>` : '') + screen.body;
  store.ui.notice = null;
  actionsEl.innerHTML = screen.actions ?? '';
  actionsEl.hidden = !screen.actions;

  drawHud();

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
  const showHud = Boolean(store.campaign) && !store.ui.showBonusShop
    && ['floor', 'tiers', 'ops'].includes(store.ui.view);
  hudEl.hidden = !showHud;
  if (!showHud) return;

  const progress = C.campaignProgress(store.campaign);
  hudEl.innerHTML = `
    <div class="hud-item">
      <span class="hud-label">Prestiges</span>
      <span class="hud-value">${progress.totalPrestiges}</span>
    </div>
    <div class="hud-item">
      <span class="hud-label">Lines</span>
      <span class="hud-value">${progress.unlockedTiers}/${progress.totalTiers}</span>
    </div>
    <div class="hud-item hud-goal">
      <span class="hud-label">Lifetime cash</span>
      <span class="hud-value">${money(progress.lifetimeCash)}</span>
    </div>`;
}

onRender(draw);

/* ------------------------------------------------------------------ *
 * The idle tick
 *
 * The tier you last opened keeps producing whether you are looking at its
 * floor, browsing the tier ladder, or checking on regional offices — the
 * same tier the offline catch-up in ui/map.js credits on reload. Only
 * leaving the app (or picking a different tier) stops it, never switching
 * screens inside it.
 *
 * Real elapsed time is measured between ticks rather than assumed to be
 * exactly one second: a backgrounded tab throttles `setInterval` (often
 * hard, sometimes to once a minute), and crediting a throttled tick as if a
 * full second had passed would quietly undercount everything it missed.
 * ------------------------------------------------------------------ */

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const elapsed = (now - lastTick) / 1000;
  lastTick = now;

  if (!store.campaign || !store.ui.tierId) return;
  if (!C.isTierUnlocked(store.campaign, C.TIER_INDEX[store.ui.tierId])) return;
  const tier = C.getTier(store.ui.tierId);
  const floor = C.getFloor(store.campaign, store.ui.tierId);
  const { earned } = S.advance(tier, floor, elapsed, store.campaign.lifetimeCash);
  if (earned > 0 && store.ui.view === 'floor') render();
}, 1000);

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

/** Apply one tap of a stepper. Returns false when it could not move. */
function applyStep(group, field, step) {
  if (group === 'componentOrder' && field === 'qty') {
    const ops = store.campaign.ops;
    if (!ops) return false;
    const next = Math.max(0, (store.ui.componentOrder ?? 0) + step);
    if (step > 0 && (next > spaceLeft(ops.warehouse) || wholesaleCost(next) > store.campaign.treasury)) return false;
    store.ui.componentOrder = next;
    return true;
  }
  return false;
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

/* Press and hold the tap button, or a stepper, to run it up quickly. */
let holdTimer = null;
let holdRepeat = null;

function stopHold() {
  clearTimeout(holdTimer);
  clearInterval(holdRepeat);
  holdTimer = holdRepeat = null;
}

document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-act="tapFloor"], [data-act="step"]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  const fire = () => {
    if (act === 'step') { if (!applyStep(el.dataset.group, el.dataset.field, Number(el.dataset.step))) return stopHold(); }
    else ACTIONS.tapFloor();
    render();
  };
  holdTimer = setTimeout(() => { holdRepeat = setInterval(fire, 90); }, 380);
});

for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(evt, stopHold);
}

document.addEventListener('dblclick', (e) => e.preventDefault());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/**
 * Work out what has been paid for before the first paint, so a player who
 * owns the game never sees a locked line flash past. An unconfigured build,
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
