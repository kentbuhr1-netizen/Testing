/**
 * Gadget Factory — title, the tier ladder, and help.
 */
import { store, render, loadSave, clearSave, bestScore } from '../store.js';
import * as C from '../campaign.js';
import * as S from '../sim.js';
import { newOps, runOfficeHours } from '../ops.js';
import { money, bar, backBar, offlineFlash } from './kit.js';
import { openTier } from './run.js';
import * as Entitlements from '../payments/client/entitlements.js';
import { paywallScreen, paywallActions, resetPaywall } from '../payments/client/paywall.js';
import { PAYMENTS } from '../payments.config.js';

const freeTiers = () => Entitlements.freeTier('gadget-factory').tiers ?? C.TIERS.length;
const tierPaidFor = (tierIndex) => Entitlements.owns('gadget-factory') || tierIndex < freeTiers();

const MAX_OFFLINE_SECONDS = 8 * 3600;

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

function title() {
  const saved = loadSave();
  const best = bestScore();
  return {
    body: `
      <div class="hero">
        <div class="hero-icon">🏭</div>
        <h1 class="hero-title">Gadget Factory</h1>
        <p class="hero-sub">Tap to assemble. Sell what you build.<br />
        Buy machines that keep going after you stop tapping.</p>
        ${best ? `<p class="muted">Best lifetime cash: ${money(best)}</p>` : ''}
      </div>
    `,
    actions: `
      ${saved ? `<button class="btn primary" data-act="continueGame">Continue</button>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" data-act="newCampaign">${saved ? 'New company' : 'Start the company'}</button>
      <button class="btn ghost" data-act="open-bonus-shop">🎬 Bonus Shop</button>
      ${Entitlements.configured() && !Entitlements.owns('gadget-factory')
        ? `<button class="btn ghost" data-act="openShop">Unlock every product line</button>` : ''}
      <button class="btn ghost" data-act="openHelp">How to play</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The tier ladder
 * ------------------------------------------------------------------ */

function tiers() {
  const campaign = store.campaign;
  const progress = C.campaignProgress(campaign);

  const rows = C.TIERS.map((tier, i) => {
    const unlocked = C.isTierUnlocked(campaign, i);
    const paid = tierPaidFor(i);
    const prestiges = campaign.prestigesByTier[i] || 0;

    if (unlocked && !paid) {
      return `
        <button class="tile" data-act="openShop">
          <span class="tile-flag">🔓</span>
          <span class="tile-main">
            <span class="tile-name">${tier.name}</span>
            <span class="tile-sub">Unlock to play</span>
          </span>
          <span class="tile-meter"><span class="tile-count">Buy</span></span>
        </button>`;
    }
    return `
      <button class="tile ${unlocked ? '' : 'locked'} ${prestiges > 0 ? 'done' : ''}"
              data-act="${unlocked ? 'openTierScreen' : ''}" data-tier="${tier.id}"
              ${unlocked ? '' : 'disabled'}>
        <span class="tile-flag">${unlocked ? tier.icon : '🔒'}</span>
        <span class="tile-main">
          <span class="tile-name">${unlocked ? tier.name : 'Locked'}</span>
          <span class="tile-sub">${unlocked ? (prestiges > 0 ? `${prestiges} prestige${prestiges === 1 ? '' : 's'}` : tier.blurb) : 'Prestige the tier before this one'}</span>
        </span>
        <span class="tile-meter">
          ${unlocked ? bar(Math.min(1, prestiges / 3)) : ''}
        </span>
      </button>`;
  }).join('');

  const gated = Entitlements.configured() && !Entitlements.owns('gadget-factory');

  return {
    body: `
      <h1 class="title">Product lines</h1>
      <p class="sub">${progress.totalPrestiges} prestiges · lifetime cash ${money(progress.lifetimeCash)}</p>
      ${offlineFlash()}
      ${C.opsUnlocked(campaign) ? `<button class="btn wide" data-act="openOps">🏢 Regional offices</button>` : ''}
      ${store.ui.opsReport ? opsFlash(store.ui.opsReport) : ''}
      <div class="tiles">${rows}</div>
      ${gated ? `<button class="btn wide primary" data-act="openShop">Unlock all ${C.TIERS.length} product lines</button>` : ''}
      <button class="btn ghost wide" data-act="openHelp">How to play</button>
      <button class="btn ghost wide danger" data-act="wipeSave">Close the company</button>
    `,
  };
}

function opsFlash(report) {
  store.ui.opsReport = null;
  if (!report) return '';
  return `<div class="notice">The offices ran ${report.hours} hour${report.hours === 1 ? '' : 's'} while you were away: ${money(report.income)} earned, ${money(report.net)} net.
    ${report.dry.length ? `<strong>${report.dry.length} warehouse ran dry.</strong>` : ''}</div>`;
}

/* ------------------------------------------------------------------ *
 * Help
 * ------------------------------------------------------------------ */

function help() {
  return {
    body: `
      ${backBar('Back', 'backFromHelp')}
      <h1 class="title">How to play</h1>

      <section class="card">
        <h2 class="card-title">The loop</h2>
        <p>Tap the floor to assemble and sell a unit by hand. Spend the cash on
        machines, which keep producing whether you are tapping or not, and on
        upgrades, which make every tap and every machine worth more.</p>
      </section>

      <section class="card">
        <h2 class="card-title">The grid</h2>
        <p>Machines run on electricity; tapping does not. Buying machines
        past what your grid connection can power wastes the extra capacity —
        it is never banked for later. Upgrade the grid to let more machines run
        at once.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Prestige</h2>
        <p>Once a tier has earned enough, you can prestige it: everything on
        that floor resets, but every dollar you ever earned becomes a
        permanent multiplier on every dollar after. The next product line
        opens on your first prestige.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Offline earnings</h2>
        <p>Machines keep running while the app is closed. Open it again and
        the time away is credited at the same rate your machines were running
        at when you left.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Regional offices</h2>
        <p>Once two product lines have had a first prestige, tiers you have
        moved on from can be staffed instead of left idle. Managers draw
        components from a shared warehouse — stockpile those freely — but each
        office runs on its own tier's grid connection, which cannot be pooled
        from anywhere else.</p>
      </section>
    `,
  };
}

function shop() {
  return paywallScreen({ game: PAYMENTS.game, gameName: PAYMENTS.gameName });
}

export const screens = { title, tiers, help, shop };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

const shopActions = paywallActions({
  rerender: render,
  close: () => {
    resetPaywall();
    store.ui.view = store.ui.shopFrom || (store.campaign ? 'tiers' : 'title');
  },
});

export const actions = {
  ...shopActions,

  openShop() {
    resetPaywall();
    store.ui.shopFrom = store.ui.view === 'shop' ? store.ui.shopFrom : store.ui.view;
    store.ui.view = 'shop';
  },

  newCampaign() {
    clearSave();
    store.campaign = C.newCampaign();
    store.ui.tierId = null;   // a tier left open from a previous campaign must not keep ticking into this one
    store.ui.view = 'tiers';
  },

  /**
   * Pick a saved game back up, and credit the time away exactly once: the
   * tier that was open keeps producing (machines only — nobody taps a phone
   * in their pocket), and any staffed offices tick in whole hours.
   */
  continueGame() {
    const data = loadSave();
    if (!data) return;
    store.campaign = data.campaign;
    store.ui.tierId = data.tierId ?? null;
    store.ui.view = data.view ?? 'tiers';

    const away = Math.min(MAX_OFFLINE_SECONDS, Math.max(0, (Date.now() - (data.lastSeen ?? Date.now())) / 1000));
    if (away > 5 && store.ui.tierId && C.isTierUnlocked(store.campaign, C.TIER_INDEX[store.ui.tierId])) {
      const tier = C.getTier(store.ui.tierId);
      const floor = C.getFloor(store.campaign, store.ui.tierId);
      const { earned } = S.advance(tier, floor, away, store.campaign.lifetimeCash);
      if (earned > 0) store.ui.offlineReport = { seconds: away, earned };
    }
    const hoursAway = Math.floor(away / 3600);
    if (store.campaign.ops && hoursAway > 0) {
      store.ui.opsReport = runOfficeHours(store.campaign, hoursAway);
    }
  },

  openTierScreen(el) {
    openTier(el.dataset.tier);
  },

  backTiers() { store.ui.view = 'tiers'; },

  openHelp() {
    store.ui.helpFrom = store.ui.view;
    store.ui.view = 'help';
  },
  backFromHelp() {
    store.ui.view = store.ui.helpFrom === 'title' || !store.campaign ? 'title' : 'tiers';
  },

  openOps() {
    if (!store.campaign.ops) store.campaign.ops = newOps();
    store.ui.view = 'ops';
  },

  wipeSave() {
    clearSave();
    store.campaign = null;
    store.ui.tierId = null;
    store.ui.view = 'title';
  },
};
