/**
 * Gadget Factory — the floor: tap, buy, and prestige one tier at a time.
 */
import { store, render, recordBest } from '../store.js';
import * as S from '../sim.js';
import * as C from '../campaign.js';
import { money, fact, bar, offlineFlash } from './kit.js';

const UPGRADES = [
  { id: 'tap', label: 'Tap Power', icon: '👆', blurb: 'Every tap assembles more at once.' },
  { id: 'speed', label: 'Machine Speed', icon: '⚡', blurb: 'Every machine you own runs faster.' },
  { id: 'price', label: 'Sell Price', icon: '💵', blurb: 'Every unit, tapped or made, sells for more.' },
  { id: 'grid', label: 'Grid Capacity', icon: '🔌', blurb: 'Raises how much machinery the floor can power at once.' },
];

function floor() {
  const tier = C.getTier(store.ui.tierId);
  const state = C.getFloor(store.campaign, tier.id);
  const lifetimeCash = store.campaign.lifetimeCash;

  const income = S.incomePerSecond(tier, state, lifetimeCash);
  const raw = S.rawMachineOutput(tier, state);
  const capacity = S.gridCapacity(tier, state);
  const throttled = raw > capacity + 1e-9;
  const progress = Math.min(1, state.totalEarnedThisRun / tier.prestigeThreshold);
  const ready = S.canPrestige(tier, state);
  const prestiges = store.campaign.prestigesByTier[C.TIER_INDEX[tier.id]] || 0;

  const machineRows = tier.machines.map((m) => {
    const owned = state.machines[m.id] || 0;
    const cost = S.machineCost(tier, m.id, owned);
    const afford = cost <= state.cash;
    return `
      <div class="row">
        <div class="row-main">
          <div class="row-name">${m.icon} ${m.name}</div>
          <div class="row-sub">Owned ${owned} · ${money(m.baseRate)}/s each, before upgrades</div>
        </div>
        <button class="chip" data-act="buyMachine" data-machine="${m.id}" ${afford ? '' : 'disabled'}>${money(cost)}</button>
      </div>`;
  }).join('');

  const upgradeRows = UPGRADES.map((u) => {
    const level = state.upgrades[u.id];
    const cost = S.upgradeCost(tier, u.id, level);
    const afford = cost <= state.cash;
    return `
      <div class="row">
        <div class="row-main">
          <div class="row-name">${u.icon} ${u.label} <span class="muted">Lv ${level}</span></div>
          <div class="row-sub">${u.blurb}</div>
        </div>
        <button class="chip" data-act="buyUpgrade" data-kind="${u.id}" ${afford ? '' : 'disabled'}>${money(cost)}</button>
      </div>`;
  }).join('');

  return {
    body: `
      <button class="crumb" data-act="backTiers">‹ Product lines</button>
      <h1 class="title">${tier.icon} ${tier.name}</h1>
      <p class="sub">${prestiges} prestige${prestiges === 1 ? '' : 's'} on this line · lifetime cash ${money(lifetimeCash)}</p>
      ${offlineFlash()}

      <section class="facts">
        ${fact('Cash', money(state.cash))}
        ${fact('Per second', money(income))}
        ${fact('Grid', `${money(raw)} / ${money(capacity)}`, throttled ? 'bad' : '')}
        ${fact('Multiplier', `${S.prestigeMultiplier(lifetimeCash).toFixed(2)}×`, 'good')}
      </section>

      ${throttled ? `<div class="warn">Machines want ${money(raw)}/s but the grid only carries ${money(capacity)}/s. The rest is wasted every second until you upgrade it.</div>` : ''}

      <section class="card center">
        <button class="tap-button" data-act="tapFloor">🔨<br />Tap</button>
        <p class="muted small">+${S.unitsPerTap(state).toFixed(2)} units, ${money(S.unitsPerTap(state) * S.sellPrice(tier, state, lifetimeCash))} a tap</p>
      </section>

      <section class="card">
        <div class="row">
          <div class="row-main">
            <div class="row-name">Prestige progress</div>
            <div class="row-sub">${money(state.totalEarnedThisRun)} / ${money(tier.prestigeThreshold)} earned this run</div>
          </div>
        </div>
        ${bar(progress, ready ? 'bar-win' : '')}
      </section>

      <section class="card">
        <h2 class="card-title">Machines</h2>
        ${machineRows}
      </section>

      <section class="card">
        <h2 class="card-title">Upgrades</h2>
        ${upgradeRows}
      </section>
    `,
    actions: `<button class="btn primary" data-act="doPrestige" ${ready ? '' : 'disabled'}>
      ${ready ? `Prestige — keep ${money(lifetimeCash + state.totalEarnedThisRun)} forever` : `Prestige at ${money(tier.prestigeThreshold)} earned`}
    </button>
    <button class="btn ghost" data-act="open-bonus-shop">🎬 Bonus Shop</button>`,
  };
}

export const screens = { floor };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export const actions = {
  tapFloor() {
    const tier = C.getTier(store.ui.tierId);
    const state = C.getFloor(store.campaign, tier.id);
    S.tap(tier, state, store.campaign.lifetimeCash);
  },

  buyMachine(el) {
    const tier = C.getTier(store.ui.tierId);
    const state = C.getFloor(store.campaign, tier.id);
    S.buyMachine(tier, state, el.dataset.machine);
  },

  buyUpgrade(el) {
    const tier = C.getTier(store.ui.tierId);
    const state = C.getFloor(store.campaign, tier.id);
    S.buyUpgrade(tier, state, el.dataset.kind);
  },

  doPrestige() {
    const tierId = store.ui.tierId;
    const tierIndex = C.TIER_INDEX[tierId];
    const tier = C.getTier(tierId);
    const state = C.getFloor(store.campaign, tierId);
    const result = S.prestige(tier, state);
    if (!result.ok) { store.ui.notice = result.why; return; }

    store.campaign.floors[tierId] = result.state;
    const change = C.recordPrestige(store.campaign, tierIndex, result.earned);
    recordBest(store.campaign.lifetimeCash);
    store.ui.notice = change.tierJustUnlocked
      ? `${C.TIERS[tierIndex + 1]?.name ?? 'Every product line'} is now open.`
      : `${tier.name} prestiged again — the multiplier just went up.`;
    if (change.opsJustUnlocked) {
      store.ui.notice += ' Regional offices are yours — staff a tier you have moved on from.';
    }
  },
};

/** Open a tier's floor. Exported so the map can open one too. */
export function openTier(tierId) {
  store.ui.tierId = tierId;
  store.ui.view = 'floor';
  render();
}
