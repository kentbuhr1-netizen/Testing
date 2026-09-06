/**
 * The Forge — the guild screens: depots, bar stock and journeymen.
 */
import { store } from '../store.js';
import * as C from '../campaign.js';
import * as G from '../ops.js';
import { money, count, fact, bar, stepper, backBar } from './kit.js';

const BAR_STEP = 250;

/* ------------------------------------------------------------------ *
 * The guild
 * ------------------------------------------------------------------ */

function guild() {
  const campaign = store.campaign;
  const guildState = campaign.guild;
  const outlook = G.networkOutlook(campaign);
  const done = C.completedCities(campaign);

  const rows = C.CITIES
    .filter((c) => C.heldIn(campaign, c.id).length > 0)
    .map((c) => {
      const depot = guildState.depots[c.id];
      const smiths = G.smithsIn(guildState, c.id).length;
      const held = C.heldIn(campaign, c.id).length;
      return `
        <button class="tile" data-act="openGuildCity" data-city="${c.id}">
          <span class="tile-flag">${c.flag}</span>
          <span class="tile-main">
            <span class="tile-name">${c.name}</span>
            <span class="tile-sub">${depot
              ? `${count(depot.bars)} bars · ${smiths} journeym${smiths === 1 ? 'an' : 'en'}`
              : 'No depot'}</span>
          </span>
          <span class="tile-meter">
            <span class="tile-count">${smiths}/${held}</span>
            ${bar(held ? smiths / held : 0)}
          </span>
        </button>`;
    }).join('');

  return {
    body: `
      ${backBar('The trade', 'backWorld')}
      <h1 class="title">⚒️ The guild</h1>
      <p class="sub">${done.length} cities clear · works one shift for every shift you work</p>

      ${guildState.alerts.length ? `<div class="warn">${guildState.alerts.join('<br />')}</div>` : ''}

      <section class="facts">
        ${fact('Capital', money(campaign.capital))}
        ${fact('Journeymen', outlook.smiths)}
        ${fact('Per shift', money(outlook.net), outlook.net >= 0 ? 'good' : 'bad')}
        ${fact('Pieces / shift', count(outlook.pieces), 'good')}
      </section>

      <section class="card">
        <p class="muted small">Wages and upkeep are owed every shift, supplied or not. A depot
        that runs out of bar stock leaves its journeymen standing on full pay at
        ${Math.round(G.UNSUPPLIED_EFFECT * 100)}% of what they could turn out. Coke is never
        stockpiled — a fire is not a crate — so journeymen buy theirs locally.</p>
      </section>

      <div class="tiles">${rows || '<p class="muted">Hold some workshops first.</p>'}</div>
    `,
  };
}

/* ------------------------------------------------------------------ *
 * One city's guild business
 * ------------------------------------------------------------------ */

function guildCity() {
  const campaign = store.campaign;
  const guildState = campaign.guild;
  const cityId = store.ui.cityId;
  const cy = C.getCity(cityId);
  const depot = guildState.depots[cityId];
  const held = C.heldIn(campaign, cityId);
  const order = store.ui.barOrder;
  const orderCost = G.wholesaleCost(order);

  const workshops = C.workshopsFor(cityId);
  const smithRows = held.map((i) => {
    const w = workshops[i];
    const staffed = G.isStaffed(guildState, cityId, i);
    const o = G.workshopOutlook(cityId, i);
    const net = o.capital - o.wage;
    return `
      <div class="row">
        <div class="row-main">
          <div class="row-name">${w.name}</div>
          <div class="row-sub">${count(o.pieces)} pieces/shift · ${money(o.wage)}/shift · ${count(o.bars)} bars</div>
          <div class="row-sub">${money(o.capital)}/shift in capital · <span class="${net >= 0 ? 'good' : 'bad'}">${
            net >= 0 ? '+' : '−'}${money(Math.abs(net))}/shift net</span></div>
        </div>
        ${staffed
          ? `<button class="chip danger" data-act="standDown" data-index="${i}">Stand down</button>`
          : `<button class="chip" data-act="stationSmith" data-index="${i}"
                     ${campaign.capital < G.SMITH_HIRE_COST ? 'disabled' : ''}>${money(G.SMITH_HIRE_COST)}</button>`}
      </div>`;
  }).join('');

  return {
    body: `
      ${backBar('The guild', 'backGuild')}
      <h1 class="title">${cy.flag} ${cy.name}</h1>
      <p class="sub">Capital ${money(campaign.capital)}</p>

      <section class="card">
        <h2 class="card-title">Depot</h2>
        ${depot ? `
          <div class="row">
            <div class="row-main">
              <div class="row-name">${count(depot.bars)} / ${count(depot.capacity)} bars</div>
              <div class="row-sub">Upkeep ${money(G.DEPOT_UPKEEP)} a shift</div>
            </div>
            <div class="row-meter">${bar(depot.bars / depot.capacity)}</div>
          </div>
          <button class="btn wide" data-act="upgradeDepot"
                  ${campaign.capital < G.CAPACITY_UPGRADE_COST ? 'disabled' : ''}>
            +${count(G.CAPACITY_UPGRADE_STEP)} capacity · ${money(G.CAPACITY_UPGRADE_COST)}
          </button>
        ` : `
          <p class="muted">No depot here. Journeymen in this city will work unsupplied.</p>
          <button class="btn wide" data-act="buildDepot"
                  ${campaign.capital < G.DEPOT_COST ? 'disabled' : ''}>
            Open a depot · ${money(G.DEPOT_COST)}
          </button>`}
      </section>

      ${depot ? `
      <section class="card">
        <h2 class="card-title">Bar stock</h2>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Bars</div>
            <div class="row-sub">${money(orderCost)} · ${Math.round((1 - G.bulkDiscount(order)) * 100)}% by the ton</div>
          </div>
          ${stepper('barOrder', 'bars', order, BAR_STEP, 0, 9_999_999, count(order))}
        </div>
        <button class="btn wide primary" data-act="orderBars" ${order <= 0 ? 'disabled' : ''}>
          Order ${count(order)} bars
        </button>
        <p class="muted small">Discounts at ${count(800)} / ${count(2000)} / ${count(4000)} bars.</p>
      </section>` : ''}

      <section class="card">
        <h2 class="card-title">Journeymen</h2>
        ${smithRows || '<p class="muted">No workshops held here yet.</p>'}
      </section>
    `,
  };
}

export const screens = { guild, guildCity };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

function flash(result) {
  if (!result.ok) store.ui.notice = result.why;
}

export const actions = {
  openGuildCity(el) {
    store.ui.cityId = el.dataset.city;
    store.ui.barOrder = 0;
    store.ui.view = 'guildCity';
  },

  backGuild() { store.ui.view = 'guild'; },

  buildDepot() { flash(G.buildDepot(store.campaign, store.ui.cityId)); },
  upgradeDepot() { flash(G.upgradeDepot(store.campaign, store.ui.cityId)); },

  orderBars() {
    const result = G.buyBars(store.campaign, store.ui.cityId, store.ui.barOrder);
    flash(result);
    if (result.ok) store.ui.barOrder = 0;
  },

  stationSmith(el) {
    flash(G.stationSmith(store.campaign, store.ui.cityId, Number(el.dataset.index)));
  },

  standDown(el) {
    flash(G.standDownSmith(store.campaign, store.ui.cityId, Number(el.dataset.index)));
  },
};
