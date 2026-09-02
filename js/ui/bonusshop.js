/**
 * The Bonus Shop: a handful of small boosts, each unlocked by watching a
 * short video ad instead of paying for it.
 *
 * There is no ad network wired into this build — it's a static page with no
 * server. This is the real hook a shipped app would plug an AdMob rewarded
 * ad into: load a RewardedAd, call show(), and grant the bonus from its
 * onUserEarnedReward callback in place of the timed stand-in below. The
 * bonus list, reward amounts and per-bonus cooldown are the real design —
 * only the "watching an ad" part is simulated.
 */
import { store, render } from '../store.js';
import { ensureBank } from '../bank.js';
import { ENHANCERS } from '../sim.js';
import { spaceLeft } from '../ops.js';
import { money } from './kit.js';

const AD_DURATION_MS = 1500;
const COOLDOWN_MS = 60_000; // once per bonus per minute in this demo — a shipped build would tune this to its ad fill rate
const COOLDOWN_KEY = 'lemonade-stand-bonusshop-v1';

const round2 = (n) => Math.round(n * 100) / 100;

function loadCooldowns() {
  try { return JSON.parse(localStorage.getItem(COOLDOWN_KEY)) || {}; } catch { return {}; }
}
function markClaimed(id) {
  try {
    const map = loadCooldowns();
    map[id] = Date.now();
    localStorage.setItem(COOLDOWN_KEY, JSON.stringify(map));
  } catch { /* private mode or a full quota — the cooldown just won't stick around */ }
}
function readyAt(id) {
  return (loadCooldowns()[id] || 0) + COOLDOWN_MS;
}

/** Adds stock to a depot without ever pushing it over capacity. */
function addDepotStock(depot, unit, amount) {
  const fit = Math.min(amount, spaceLeft(depot));
  depot.stock[unit] += fit;
}

const midRunOnly = () => (store.run ? { ok: true } : { ok: false, why: 'Only useful mid-run — start one first.' });

const BONUSES = [
  {
    id: 'cash',
    icon: '💰',
    title: 'Quick Cash',
    describe: () => `+${money(15)} cash, straight into your pocket.`,
    available: () => {
      if (store.run || store.campaign) return { ok: true };
      return { ok: false, why: 'Start a campaign or free play first.' };
    },
    apply: () => {
      if (store.run) { store.run.money = round2(store.run.money + 15); return; }
      store.campaign.treasury = round2(store.campaign.treasury + 15);
    },
  },
  {
    id: 'restock',
    icon: '🍋',
    title: 'Free Restock',
    describe: () => '+10 lemons, +10 sugar, +20 cups — straight into today’s cooler.',
    available: midRunOnly,
    apply: () => {
      const r = store.run;
      r.inventory.lemons += 10;
      r.inventory.sugar += 10;
      r.inventory.cups += 20;
    },
  },
  {
    id: 'ice',
    icon: '🧊',
    title: 'Free Ice',
    describe: () => '+30 ice cubes, straight into today’s cooler.',
    available: midRunOnly,
    apply: () => { store.run.inventory.ice += 30; },
  },
  {
    id: 'enhancers',
    icon: '🍹',
    title: 'Enhancer Sample',
    describe: () => `+5 of every enhancer, free to offer at the stand.`,
    available: midRunOnly,
    apply: () => {
      const inv = store.run.inventory.enhancers || (store.run.inventory.enhancers = {});
      for (const id of Object.keys(ENHANCERS)) inv[id] = (inv[id] || 0) + 5;
    },
  },
  {
    id: 'reputation',
    icon: '⭐',
    title: 'Reputation Boost',
    describe: () => 'Nudges today’s reputation up, so the street expects a bit more from you.',
    available: midRunOnly,
    apply: () => {
      const r = store.run;
      r.reputation = Math.min(1, r.reputation + 0.12);
    },
  },
  {
    id: 'depot',
    icon: '📦',
    title: 'Depot Restock',
    describe: () => '+100 lemons, +100 sugar, +200 cups into one of your depots.',
    available: () => {
      const ops = store.campaign?.ops;
      if (!ops || Object.keys(ops.warehouses).length === 0) {
        return { ok: false, why: 'Build a depot in Operations first.' };
      }
      return { ok: true };
    },
    apply: () => {
      const ops = store.campaign.ops;
      const cityId = ops.warehouses[store.ui.cityId] ? store.ui.cityId : Object.keys(ops.warehouses)[0];
      const depot = ops.warehouses[cityId];
      addDepotStock(depot, 'lemons', 100);
      addDepotStock(depot, 'sugar', 100);
      addDepotStock(depot, 'cups', 200);
    },
  },
  {
    id: 'interest',
    icon: '🏦',
    title: 'Bank Bonus',
    describe: () => `+${money(10)} deposited straight into your bank balance.`,
    available: () => (store.campaign ? { ok: true } : { ok: false, why: 'Start a campaign first — free play has no bank.' }),
    apply: () => {
      const bank = ensureBank(store.campaign);
      bank.balance = round2(bank.balance + 10);
    },
  },
];

function watchingScreen(bonusId) {
  const bonus = BONUSES.find((b) => b.id === bonusId);
  return {
    body: `
      <div class="rank">
        <div class="rank-icon">▶️</div>
        <div class="rank-title">Watching Ad…</div>
      </div>
      <div class="card center">
        <p class="muted">${bonus.icon} ${bonus.title} unlocks when the ad finishes.</p>
        <div class="progress"><i id="ad-bar"></i></div>
      </div>`,
    actions: '',
    mounted: () => runAdTimer(bonusId),
  };
}

function runAdTimer(bonusId) {
  const barEl = document.getElementById('ad-bar');
  if (!barEl) return;
  const started = performance.now();

  const frame = (now) => {
    const t = Math.min(1, (now - started) / AD_DURATION_MS);
    barEl.style.width = `${t * 100}%`;
    if (t < 1) requestAnimationFrame(frame);
    else finishAd(bonusId);
  };
  requestAnimationFrame(frame);
}

function finishAd(bonusId) {
  const bonus = BONUSES.find((b) => b.id === bonusId);
  store.ui.watchingAd = null;
  if (bonus && bonus.available().ok) {
    bonus.apply();
    markClaimed(bonusId);
    store.ui.notice = `${bonus.icon} ${bonus.title} claimed! ${bonus.describe()}`;
  }
  render();
}

function bonusShopScreen() {
  if (store.ui.watchingAd) return watchingScreen(store.ui.watchingAd);

  const rows = BONUSES.map((b) => {
    const avail = b.available();
    const wait = Math.max(0, readyAt(b.id) - Date.now());
    const onCooldown = avail.ok && wait > 0;
    const control = !avail.ok
      ? `<span class="muted row-note">${avail.why}</span>`
      : onCooldown
        ? `<span class="chip" style="opacity:.6">⏱ ${Math.ceil(wait / 1000)}s</span>`
        : `<button class="chip" data-act="watch-ad" data-bonus="${b.id}">▶️ Watch Ad</button>`;
    return `<div class="row">
        <div class="row-main">
          <div class="row-name">${b.icon} ${b.title}</div>
          <div class="row-sub">${b.describe()}</div>
        </div>
        ${control}
      </div>`;
  }).join('');

  return {
    body: `
      <div class="rank">
        <div class="rank-icon">🎬</div>
        <div class="rank-title">Bonus Shop</div>
      </div>
      <div class="card">
        <p class="muted">Watch a short ad, get a small boost. Free, no purchase — one bonus at a time.</p>
      </div>
      <div class="card">${rows}</div>
      <p class="muted center" style="font-size:12px">This is a prototype with no ad network connected. "Watch Ad" plays a short timed stand-in
        so you can see the mechanic — a shipped build would swap in a real AdMob rewarded ad here.</p>`,
    actions: `<button class="btn" data-act="close-bonus-shop">Back</button>`,
  };
}

export const screens = { bonusShop: bonusShopScreen };

export const actions = {
  'open-bonus-shop': () => { store.ui.showBonusShop = true; },
  'close-bonus-shop': () => { store.ui.showBonusShop = false; store.ui.watchingAd = null; },
  'watch-ad': (el) => {
    const id = el.dataset.bonus;
    const bonus = BONUSES.find((b) => b.id === id);
    if (!bonus || !bonus.available().ok || Date.now() < readyAt(id)) return;
    store.ui.watchingAd = id;
  },
};
