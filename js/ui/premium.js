/**
 * The one premium unlock in the game: lemons that never spoil.
 *
 * There is no payment processor wired into this build — it is a static page
 * with no server to talk to. This screen is the real hook a shipped app
 * would connect to App Store / Play Store IAP or Stripe: the price, the
 * copy and the mechanic it flips are all real, but the button here is
 * explicitly labelled as a demo unlock rather than pretending to charge
 * anyone. See js/store.js for the local flag it sets.
 */
import { store, isPremiumUnlocked, unlockPremiumDemo } from '../store.js';
import { LEMON_SHELF_LIFE_DAYS } from '../sim.js';

const PRICE = '$1.99';
const FLAG = 'neverExpireLemons';

function premiumScreen() {
  const unlocked = isPremiumUnlocked(FLAG);
  return {
    body: `
      <div class="rank">
        <div class="rank-icon">🔒</div>
        <div class="rank-title">Never-Expiring Lemons</div>
      </div>
      <div class="card">
        <p>Every lemon you buy is good for ${LEMON_SHELF_LIFE_DAYS} days in the cooler, then it spoils —
          whatever's left over is gone, and buying too far ahead of a slow stretch stops paying off.</p>
        <p>This unlock removes the clock. Buy in bulk whenever prices are good, hold as much stock as
          you like, and none of it ever goes bad.</p>
      </div>
      ${unlocked
        ? `<div class="card">
             <p class="good"><strong>✓ Unlocked.</strong> Your lemons never expire, in every run from here on.</p>
           </div>`
        : `<div class="card paywall">
             <div class="paywall-price">${PRICE}<small>one-time</small></div>
             <p class="muted">This is a prototype with no payment processor connected — no card is charged and
               no store is involved. Tapping the button below flips the unlock locally so you can see what it
               does. A shipped version would put a real App Store / Play Store / Stripe purchase behind this
               exact same button.</p>
           </div>`}`,
    actions: unlocked
      ? `<button class="btn" data-act="close-premium">Back</button>`
      : `<button class="btn" data-act="unlock-premium-demo">Unlock — ${PRICE} (Demo, No Charge)</button>
         <button class="btn-ghost" data-act="close-premium">Not Now</button>`,
  };
}

export const screens = { premium: premiumScreen };

export const actions = {
  'unlock-premium-demo': () => {
    unlockPremiumDemo(FLAG);
    if (store.run) store.run.premium = { ...(store.run.premium || {}), neverExpireLemons: true };
    store.ui.notice = '🔒 Never-Expiring Lemons unlocked (demo) — your lemons stop spoiling from now on.';
  },
  'close-premium': () => { store.ui.showPremium = false; },
};
