/**
 * The Round — the firm: yards, wholesale supply and standing crews.
 */
import { store } from '../store.js';
import * as C from '../campaign.js';
import * as O from '../ops.js';
import { money, whole, fact, bar, stepper, backBar } from './kit.js';

const FUEL_STEP = 100;
const BLADE_STEP = 10;

function ops() {
  const campaign = store.campaign;
  const opsState = campaign.ops;
  const outlook = O.networkOutlook(campaign);

  const rows = C.TOWNS
    .filter((t) => C.heldIn(campaign, t.id).length > 0)
    .map((t) => {
      const yard = opsState.yards[t.id];
      const crews = O.crewsIn(opsState, t.id).length;
      const held = C.heldIn(campaign, t.id).length;
      return `
        <button class="tile" data-act="openOpsTown" data-town="${t.id}">
          <span class="tile-flag">${t.icon}</span>
          <span class="tile-main">
            <span class="tile-name">${t.name}</span>
            <span class="tile-sub">${yard
              ? `${yard.stock.fuel}L fuel · ${yard.stock.blades} blades · ${crews} crew${crews === 1 ? '' : 's'}`
              : 'No yard'}</span>
          </span>
          <span class="tile-meter">
            <span class="tile-count">${crews}/${held}</span>
            ${bar(held ? crews / held : 0)}
          </span>
        </button>`;
    }).join('');

  return {
    body: `
      ${backBar('The country', 'backWorld')}
      <h1 class="title">🚚 The firm</h1>
      <p class="sub">Runs one day for every day you work a round yourself</p>

      ${opsState.alerts.length ? `<div class="warn">${opsState.alerts.join('<br />')}</div>` : ''}

      <section class="facts">
        ${fact('Bank', whole(campaign.treasury), campaign.treasury < 0 ? 'bad' : '')}
        ${fact('Crews', outlook.crews)}
        ${fact('Per day', money(outlook.net), outlook.net >= 0 ? 'good' : 'bad')}
        ${fact('Lawns / day', outlook.lawns, 'good')}
      </section>

      <section class="card">
        <p class="muted small">Wages and yard upkeep are owed every day, supplied or not. A yard
        that runs out leaves its crews on full pay doing ${Math.round(O.UNSUPPLIED_EFFECT * 100)}%
        of a day's work. Daylight is the one thing you cannot stock.</p>
      </section>

      <div class="tiles">${rows || '<p class="muted">Hold some rounds first.</p>'}</div>
    `,
  };
}

function opsTown() {
  const campaign = store.campaign;
  const opsState = campaign.ops;
  const townId = store.ui.townId;
  const t = C.getTown(townId);
  const yard = opsState.yards[townId];
  const held = C.heldIn(campaign, townId);
  const order = store.ui.order;
  const orderCost = O.restockCost(order);

  const rounds = C.roundsFor(townId);
  const crewRows = held.map((i) => {
    const round = rounds[i];
    const staffed = O.isStaffed(opsState, townId, i);
    const o = O.roundOutlook(townId, i);
    return `
      <div class="row">
        <div class="row-main">
          <div class="row-name">${round.name}</div>
          <div class="row-sub">${money(o.takings)}/day · ${money(o.wage)} wages · ${o.fuel}L, ${o.blades} blades</div>
        </div>
        ${staffed
          ? `<button class="chip danger" data-act="layOff" data-index="${i}">Lay off</button>`
          : `<button class="chip" data-act="hireCrew" data-index="${i}"
                     ${campaign.treasury < O.CREW_HIRE_COST ? 'disabled' : ''}>${whole(O.CREW_HIRE_COST)}</button>`}
      </div>`;
  }).join('');

  return {
    body: `
      ${backBar('The firm', 'backOps')}
      <h1 class="title">${t.icon} ${t.name}</h1>
      <p class="sub">Bank ${money(campaign.treasury)}</p>

      <section class="card">
        <h2 class="card-title">Yard</h2>
        ${yard ? `
          <div class="row">
            <div class="row-main">
              <div class="row-name">${yard.stock.fuel}L fuel · ${yard.stock.blades} blades</div>
              <div class="row-sub">${O.stockTotal(yard)} of ${yard.capacity} units · upkeep ${money(O.YARD_UPKEEP)}/day</div>
            </div>
            <div class="row-meter">${bar(O.stockTotal(yard) / yard.capacity)}</div>
          </div>
          <button class="btn wide" data-act="upgradeYard"
                  ${campaign.treasury < O.CAPACITY_UPGRADE_COST ? 'disabled' : ''}>
            +${O.CAPACITY_UPGRADE_STEP} units · ${whole(O.CAPACITY_UPGRADE_COST)}
          </button>
          <button class="btn ghost wide danger" data-act="closeYard">Close this yard</button>
        ` : `
          <p class="muted">No yard here. Crews in this town would work unsupplied.</p>
          <button class="btn wide" data-act="openYard"
                  ${campaign.treasury < O.YARD_COST ? 'disabled' : ''}>
            Open a yard · ${whole(O.YARD_COST)}
          </button>`}
      </section>

      ${yard ? `
      <section class="card">
        <h2 class="card-title">Supplies</h2>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Fuel</div>
            <div class="row-sub">${money(O.wholesaleCost('fuel', order.fuel))}</div>
          </div>
          ${stepper('order', 'fuel', order.fuel, FUEL_STEP, 0, 99999, `${order.fuel}L`)}
        </div>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Blades</div>
            <div class="row-sub">${money(O.wholesaleCost('blades', order.blades))}</div>
          </div>
          ${stepper('order', 'blades', order.blades, BLADE_STEP, 0, 9999)}
        </div>
        <button class="btn wide primary" data-act="buySupplies" ${orderCost <= 0 ? 'disabled' : ''}>
          Order · ${money(orderCost)}
        </button>
        <p class="muted small">Discounts by the pallet at 500 / 1,500 / 4,000 units.
        Daylight is never stocked — a crew that runs out of day cannot bank it.</p>
      </section>` : ''}

      <section class="card">
        <h2 class="card-title">Crews</h2>
        ${crewRows || '<p class="muted">No rounds held here yet.</p>'}
      </section>
    `,
  };
}

export const screens = { ops, opsTown };

function flash(result) {
  if (!result.ok) store.ui.notice = result.why;
}

export const actions = {
  openOpsTown(el) {
    store.ui.townId = el.dataset.town;
    store.ui.order = { fuel: 0, blades: 0 };
    store.ui.view = 'opsTown';
  },
  backOps() { store.ui.view = 'ops'; },

  openYard() { flash(O.openYard(store.campaign, store.ui.townId)); },
  upgradeYard() { flash(O.upgradeYard(store.campaign, store.ui.townId)); },
  closeYard() { flash(O.closeYard(store.campaign, store.ui.townId)); },

  buySupplies() {
    const result = O.buySupplies(store.campaign, store.ui.townId, store.ui.order);
    flash(result);
    if (result.ok) store.ui.order = { fuel: 0, blades: 0 };
  },

  hireCrew(el) { flash(O.hireCrew(store.campaign, store.ui.townId, Number(el.dataset.index))); },
  layOff(el) { flash(O.layOffCrew(store.campaign, store.ui.townId, Number(el.dataset.index))); },
};
