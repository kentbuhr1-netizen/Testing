/**
 * Gadget Factory — regional offices: managers, the component warehouse.
 */
import { store } from '../store.js';
import * as C from '../campaign.js';
import * as O from '../ops.js';
import { money, bar, backBar } from './kit.js';

const ORDER_STEP = 500;

function ops() {
  const campaign = store.campaign;
  const opsState = campaign.ops;
  const outlook = O.networkOutlook(campaign);
  const warehouse = opsState.warehouse;
  const order = store.ui.componentOrder ?? 0;
  const orderCost = O.wholesaleCost(order);

  const rows = C.TIERS.map((tier, i) => {
    if (i >= campaign.unlockedTiers) return '';
    const office = opsState.offices[tier.id];
    const managers = office?.managers ?? 0;
    const o = office ? O.officeOutlook(tier, managers || 1, campaign.lifetimeCash) : null;
    return `
      <div class="row">
        <div class="row-main">
          <div class="row-name">${tier.icon} ${tier.name}</div>
          <div class="row-sub">${office
            ? `${managers}/${O.MAX_MANAGERS_PER_OFFICE} managers · ${money(managers ? o.income : 0)}/hr · needs ${managers * O.COMPONENTS_PER_MANAGER_HOUR}/hr components`
            : 'No office here yet'}</div>
        </div>
        ${office
          ? `<div class="stepper-inline">
              <button class="chip" data-act="layoffManager" data-tier="${tier.id}" ${managers <= 0 ? 'disabled' : ''}>−</button>
              <button class="chip" data-act="hireManager" data-tier="${tier.id}"
                ${managers >= O.MAX_MANAGERS_PER_OFFICE || campaign.treasury < O.managerCost(i, managers) ? 'disabled' : ''}>
                + ${money(O.managerCost(i, managers))}
              </button>
            </div>`
          : `<button class="chip" data-act="buildOffice" data-tier="${tier.id}"
              ${campaign.treasury < O.officeHireCost(i) ? 'disabled' : ''}>${money(O.officeHireCost(i))}</button>`}
      </div>`;
  }).join('');

  return {
    body: `
      ${backBar('Product lines', 'backTiers')}
      <h1 class="title">🏢 Regional offices</h1>
      <p class="sub">Runs in real hours, in step with whatever time passes while you play elsewhere or are away.</p>

      ${opsState.alerts.length ? `<div class="warn">${opsState.alerts.join('<br />')}</div>` : ''}

      <section class="facts">
        <div class="fact"><div class="fact-label">Treasury</div><div class="fact-value">${money(campaign.treasury)}</div></div>
        <div class="fact"><div class="fact-label">Managers</div><div class="fact-value">${outlook?.managers ?? 0}</div></div>
        <div class="fact"><div class="fact-label">Net / hour</div><div class="fact-value ${outlook && outlook.net >= 0 ? 'good' : 'bad'}">${money(outlook?.net ?? 0)}</div></div>
      </section>

      <section class="card">
        <h2 class="card-title">Component warehouse</h2>
        <div class="row">
          <div class="row-main">
            <div class="row-name">${warehouse.components} / ${warehouse.capacity}</div>
            <div class="row-sub">Upkeep is charged whether or not the shelf has anything on it. Warehouse capacity itself can be stockpiled; a tier's own grid power never can.</div>
          </div>
          <div class="row-meter">${bar(warehouse.components / warehouse.capacity)}</div>
        </div>
        <button class="btn wide" data-act="upgradeWarehouse" ${campaign.treasury < O.WAREHOUSE_UPGRADE_COST ? 'disabled' : ''}>
          +${O.WAREHOUSE_CAPACITY_STEP} capacity · ${money(O.WAREHOUSE_UPGRADE_COST)}
        </button>
        <div class="row" style="margin-top:10px">
          <div class="row-main">
            <div class="row-name">Order components</div>
            <div class="row-sub">${money(orderCost)} for ${order} · bulk discounts kick in past 10,000</div>
          </div>
          <div class="stepper">
            <button data-act="step" data-group="componentOrder" data-field="qty" data-step="${-ORDER_STEP}" ${order <= 0 ? 'disabled' : ''}>−</button>
            <output>${order}</output>
            <button data-act="step" data-group="componentOrder" data-field="qty" data-step="${ORDER_STEP}">+</button>
          </div>
        </div>
        <button class="btn wide primary" data-act="orderComponents" ${order <= 0 ? 'disabled' : ''}>Order ${order} components</button>
      </section>

      <section class="card">
        <h2 class="card-title">Offices</h2>
        ${rows || '<p class="muted">Unlock a product line first.</p>'}
      </section>
    `,
  };
}

export const screens = { ops };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function flash(result) {
  if (!result.ok) store.ui.notice = result.why;
}

export const actions = {
  buildOffice(el) { flash(O.buildOffice(store.campaign, el.dataset.tier)); },
  hireManager(el) { flash(O.hireManager(store.campaign, el.dataset.tier)); },
  layoffManager(el) { flash(O.layoffManager(store.campaign, el.dataset.tier)); },
  upgradeWarehouse() { flash(O.upgradeWarehouse(store.campaign)); },

  orderComponents() {
    const qty = store.ui.componentOrder ?? 0;
    const result = O.buyComponents(store.campaign, qty);
    flash(result);
    if (result.ok) store.ui.componentOrder = 0;
  },
};
