/* Copied from shared/bonusshop/client/shell.js by tools/sync-payments.mjs — edit the shared copy, not this one. */
/**
 * The Bonus Shop screen: a handful of small boosts, each unlocked by watching
 * a short video ad instead of paying for it.
 *
 * There is no ad network wired into this build — it's a static page with no
 * server. This is the real hook a shipped app would plug an AdMob rewarded ad
 * into: load a RewardedAd, call show(), and grant the bonus from its
 * onUserEarnedReward callback in place of the timed stand-in below. The bonus
 * list, reward amounts and per-bonus cooldown are the real design — only the
 * "watching an ad" part is simulated.
 *
 * Every game gets this same shell and supplies only its own bonuses, so the
 * cooldown behaviour, the ad gate and the disclaimer stay identical across the
 * series and cannot drift apart game by game.
 */
import { createBonusCore } from './core.js';

/**
 * @param store      the game's shared state (uses `store.ui` for view flags)
 * @param render     the game's re-render function
 * @param bonuses    this game's bonus list — see core.js for the shape
 * @param storageKey where this game keeps its cooldowns; must be unique per game
 */
export function createBonusShop({
  store,
  render,
  bonuses,
  storageKey,
  cooldownMs = 60_000,
  adDurationMs = 1500,
  title = 'Bonus Shop',
}) {
  const core = createBonusCore({ bonuses, storageKey, cooldownMs });

  function runAdTimer(bonusId) {
    const barEl = document.getElementById('ad-bar');
    if (!barEl) return;
    const started = performance.now();

    const frame = (now) => {
      const t = Math.min(1, (now - started) / adDurationMs);
      barEl.style.width = `${t * 100}%`;
      if (t < 1) requestAnimationFrame(frame);
      else finishAd(bonusId);
    };
    requestAnimationFrame(frame);
  }

  /**
   * The ad finished. Re-check availability rather than trusting the state we
   * started with — a run can end, or money can be spent, while it plays.
   */
  function finishAd(bonusId) {
    store.ui.watchingAd = null;
    const result = core.claim(bonusId);
    if (result.claimed) {
      const b = result.bonus;
      store.ui.notice = `${b.icon} ${b.title} claimed! ${b.describe()}`;
    }
    render();
  }

  function watchingScreen(bonusId) {
    const bonus = core.find(bonusId);
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

  function bonusShopScreen() {
    if (store.ui.watchingAd) return watchingScreen(store.ui.watchingAd);

    const rows = core.bonuses.map((b) => {
      const state = core.status(b.id);
      const control =
        state.state === 'unavailable'
          ? `<span class="muted row-note">${state.why}</span>`
          : state.state === 'cooldown'
            ? `<span class="chip" style="opacity:.6">⏱ ${Math.ceil(state.waitMs / 1000)}s</span>`
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
        <div class="rank-title">${title}</div>
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

  return {
    core,
    screens: { bonusShop: bonusShopScreen },
    actions: {
      'open-bonus-shop': () => { store.ui.showBonusShop = true; },
      'close-bonus-shop': () => { store.ui.showBonusShop = false; store.ui.watchingAd = null; },
      'watch-ad': (el) => {
        const id = el.dataset.bonus;
        if (core.status(id).state !== 'ready') return;
        store.ui.watchingAd = id;
      },
    },
  };
}
