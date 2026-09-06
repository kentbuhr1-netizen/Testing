/**
 * Outbreak — the agency screens: laboratories, procurement and standing teams.
 */
import { store } from '../store.js';
import * as C from '../campaign.js';
import * as O from '../ops.js';
import { money, lives, fact, bar, stepper, backBar } from './kit.js';

const DOSE_STEP = 10_000;

/* ------------------------------------------------------------------ *
 * The agency
 * ------------------------------------------------------------------ */

function ops() {
  const campaign = store.campaign;
  const opsState = campaign.ops;
  const outlook = O.networkOutlook(campaign);
  const done = C.completedRegions(campaign);

  const rows = C.REGIONS
    .filter((r) => C.heldIn(campaign, r.id).length > 0)
    .map((r) => {
      const lab = opsState.labs[r.id];
      const teams = O.teamsIn(opsState, r.id).length;
      const held = C.heldIn(campaign, r.id).length;
      return `
        <button class="tile" data-act="openOpsRegion" data-region="${r.id}">
          <span class="tile-flag">${r.flag}</span>
          <span class="tile-main">
            <span class="tile-name">${r.name}</span>
            <span class="tile-sub">${lab
              ? `${lives(lab.doses)} doses · ${teams} team${teams === 1 ? '' : 's'}`
              : 'No laboratory'}</span>
          </span>
          <span class="tile-meter">
            <span class="tile-count">${teams}/${held}</span>
            ${bar(held ? teams / held : 0)}
          </span>
        </button>`;
    }).join('');

  return {
    body: `
      ${backBar('The world', 'backWorld')}
      <h1 class="title">🏛️ The agency</h1>
      <p class="sub">${done.length} regions clear · runs one week for every week you work</p>

      ${opsState.alerts.length
        ? `<div class="warn">${opsState.alerts.join('<br />')}</div>` : ''}

      <section class="facts">
        ${fact('Budget', money(campaign.treasury))}
        ${fact('Teams', outlook.teams)}
        ${fact('Per week', money(outlook.net), outlook.net >= 0 ? 'good' : 'bad')}
        ${fact('Lives / week', lives(outlook.saved), 'good')}
      </section>

      <section class="card">
        <p class="muted small">Wages and upkeep are owed every week, supplied or not. A
        laboratory that runs out of doses leaves its teams standing on full pay at
        ${Math.round(O.UNSUPPLIED_EFFECT * 100)}% effectiveness.</p>
      </section>

      <div class="tiles">${rows || '<p class="muted">Hold some districts first.</p>'}</div>
    `,
  };
}

/* ------------------------------------------------------------------ *
 * One region's operations
 * ------------------------------------------------------------------ */

function opsRegion() {
  const campaign = store.campaign;
  const opsState = campaign.ops;
  const regionId = store.ui.regionId;
  const rg = C.getRegion(regionId);
  const lab = opsState.labs[regionId];
  const held = C.heldIn(campaign, regionId);
  const order = store.ui.doseOrder;
  const orderCost = O.wholesaleCost(order);

  const districts = C.districtsFor(regionId);
  const teamRows = held.map((i) => {
    const d = districts[i];
    const staffed = O.isStaffed(opsState, regionId, i);
    const o = O.districtOutlook(regionId, i);
    return `
      <div class="row">
        <div class="row-main">
          <div class="row-name">${d.name}</div>
          <div class="row-sub">${lives(o.saved)} lives/wk · ${money(o.wage + o.beds)}/wk · ${lives(o.doses)} doses</div>
          <div class="row-sub">${money(o.grant)}/wk in grants · <span class="${
            o.grant >= o.wage + o.beds ? 'good' : 'bad'}">${o.grant >= o.wage + o.beds ? '+' : '−'}${
            money(Math.abs(o.grant - o.wage - o.beds))}/wk net</span></div>
        </div>
        ${staffed
          ? `<button class="chip danger" data-act="standDown" data-index="${i}">Stand down</button>`
          : `<button class="chip" data-act="stationTeam" data-index="${i}"
                     ${campaign.treasury < O.TEAM_HIRE_COST ? 'disabled' : ''}>${money(O.TEAM_HIRE_COST)}</button>`}
      </div>`;
  }).join('');

  return {
    body: `
      ${backBar('The agency', 'backOps')}
      <h1 class="title">${rg.flag} ${rg.name}</h1>
      <p class="sub">Budget ${money(campaign.treasury)}</p>

      <section class="card">
        <h2 class="card-title">Laboratory</h2>
        ${lab ? `
          <div class="row">
            <div class="row-main">
              <div class="row-name">${lives(lab.doses)} / ${lives(lab.capacity)} doses</div>
              <div class="row-sub">Upkeep ${money(O.LAB_UPKEEP)} a week</div>
            </div>
            <div class="row-meter">${bar(lab.doses / lab.capacity)}</div>
          </div>
          <button class="btn wide" data-act="upgradeLab"
                  ${campaign.treasury < O.CAPACITY_UPGRADE_COST ? 'disabled' : ''}>
            +${lives(O.CAPACITY_UPGRADE_STEP)} capacity · ${money(O.CAPACITY_UPGRADE_COST)}
          </button>
        ` : `
          <p class="muted">No laboratory here. Teams in this region will work unsupplied.</p>
          <button class="btn wide" data-act="buildLab"
                  ${campaign.treasury < O.LAB_COST ? 'disabled' : ''}>
            Build a laboratory · ${money(O.LAB_COST)}
          </button>`}
      </section>

      ${lab ? `
      <section class="card">
        <h2 class="card-title">Procurement</h2>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Doses</div>
            <div class="row-sub">${money(orderCost)} · ${Math.round((1 - O.bulkDiscount(order)) * 100)}% bulk discount</div>
          </div>
          ${stepper('doseOrder', 'doses', order, DOSE_STEP, 0, 9_999_999, lives(order))}
        </div>
        <button class="btn wide primary" data-act="orderDoses" ${order <= 0 ? 'disabled' : ''}>
          Order ${lives(order)} doses
        </button>
        <p class="muted small">Discounts at ${lives(200_000)} / ${lives(500_000)} / ${lives(1_000_000)} doses.
        Beds are never stockpiled — a bed is a building, so teams fund theirs locally.</p>
      </section>` : ''}

      <section class="card">
        <h2 class="card-title">Standing teams</h2>
        ${teamRows || '<p class="muted">No districts held here yet.</p>'}
      </section>
    `,
  };
}

export const screens = { ops, opsRegion };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function flash(result) {
  if (!result.ok) store.ui.notice = result.why;
}

export const actions = {
  openOpsRegion(el) {
    store.ui.regionId = el.dataset.region;
    store.ui.doseOrder = 0;
    store.ui.view = 'opsRegion';
  },

  backOps() { store.ui.view = 'ops'; },

  buildLab() { flash(O.buildLab(store.campaign, store.ui.regionId)); },
  upgradeLab() { flash(O.upgradeLab(store.campaign, store.ui.regionId)); },

  orderDoses() {
    const result = O.buyDoses(store.campaign, store.ui.regionId, store.ui.doseOrder);
    flash(result);
    if (result.ok) store.ui.doseOrder = 0;
  },

  stationTeam(el) {
    flash(O.stationTeam(store.campaign, store.ui.regionId, Number(el.dataset.index)));
  },

  standDown(el) {
    flash(O.standDownTeam(store.campaign, store.ui.regionId, Number(el.dataset.index)));
  },
};
