/** Operations: the depot network, wholesale buying and staffed corners. */
import * as C from '../campaign.js';
import * as O from '../ops.js';
import { store } from '../store.js';
import { money, whole, fact, bar, backBar, row, stepper, tierPill } from './kit.js';

const ops = () => store.campaign.ops;

/* ------------------------------------------------------------------ *
 * Network overview
 * ------------------------------------------------------------------ */

function opsScreen() {
  const campaign = store.campaign;
  const outlook = O.networkOutlook(campaign);
  const owned = C.CITIES.filter((c) => C.claimedIn(campaign, c.id).length > 0);

  const rows = owned.map((city) => {
    const staffed = O.staffedIn(ops(), city.id).length;
    const depot = ops().warehouses[city.id];
    const look = staffed > 0 ? O.cityOutlook(campaign, city.id) : null;
    const dry = look && look.daysOfStock <= 2;
    return `<button class="city" data-act="open-ops-city" data-city="${city.id}">
        <div class="city-flag">${city.flag}</div>
        <div class="city-main">
          <div class="city-name">${city.name} ${dry ? '<span class="warn-dot">⚠️</span>' : ''}</div>
          <div class="row-sub">
            ${depot ? `Depot · ${O.stockTotal(depot)}/${depot.capacity} units` : 'No depot'} ·
            ${staffed} staffed
          </div>
          ${depot ? bar(O.stockTotal(depot) / depot.capacity, dry ? 'bar-warn' : '') : ''}
        </div>
        <div class="city-count">${look ? money(look.net) : '—'}<small>/day</small></div>
      </button>`;
  }).join('');

  return {
    body: `
      ${backBar('The Map', 'to-world')}
      <h1>🏭 Operations</h1>
      <div class="card">
        <h2>The network</h2>
        <div class="facts">
          ${fact('Staffed corners', outlook.corners)}
          ${fact('Net per day', money(outlook.net), outlook.net >= 0 ? 'good' : 'bad')}
          ${fact('Cups per day', outlook.cities.reduce((n, c) => n + c.cups, 0))}
          ${fact('Days traded', ops().day)}
        </div>
        <p class="muted" style="margin-top:10px">Your network trades one day for every day you work a corner by hand.</p>
      </div>
      ${ops().alerts.length
        ? `<div class="card warn-card"><h2>Alerts</h2>${ops().alerts.map((a) => `<p>⚠️ ${a.text}</p>`).join('')}</div>`
        : ''}
      <div class="city-list">${rows || '<p class="muted center">Claim some corners first.</p>'}</div>`,
    actions: `<button class="btn" data-act="to-world">Back to the Map</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * One city's operation
 * ------------------------------------------------------------------ */

function opsCityScreen() {
  const campaign = store.campaign;
  const cityId = store.ui.cityId;
  const city = C.getCity(cityId);
  const depot = ops().warehouses[cityId];
  const claimed = C.claimedIn(campaign, cityId);
  const corners = C.cornersFor(cityId);
  const look = O.staffedIn(ops(), cityId).length > 0 ? O.cityOutlook(campaign, cityId) : null;

  if (!depot) {
    return {
      body: `
        ${backBar('Operations', 'to-ops')}
        <h1>${city.flag} ${city.name}</h1>
        <div class="card">
          <h2>No depot here</h2>
          <p>A depot lets you buy lemons, sugar and cups by the crate at wholesale, and supply the corners you own in this city.</p>
          <p class="muted">Ice is never stocked — it melts. Staffed corners buy theirs locally each morning.</p>
          <div class="facts" style="margin-top:12px">
            ${fact('Depot', money(O.WAREHOUSE_COST))}
            ${fact('Holds', `${O.WAREHOUSE_BASE_CAPACITY} units`)}
          </div>
        </div>`,
      actions: `
        <button class="btn" data-act="buy-depot" data-city="${cityId}"
          ${campaign.treasury < O.WAREHOUSE_COST ? 'disabled' : ''}>
          Build Depot · ${money(O.WAREHOUSE_COST)}
        </button>
        <button class="btn-ghost" data-act="to-ops">Back</button>`,
    };
  }

  const order = store.ui.restock;
  const units = order.lemons + order.sugar + order.cups;
  const cost = O.restockCost(order);
  const space = O.spaceLeft(depot);
  const discount = O.bulkDiscount(units);

  const stockRow = (unit, label) => {
    const held = depot.stock[unit];
    const perDay = look ? look.needs[unit] : 0;
    return row(`${label}`, `${held} in the depot${perDay ? ` · ${perDay}/day used` : ''}`,
      stepper('restock', unit, order[unit], 100, 0, 99999));
  };

  const staffRows = claimed.map((i) => {
    const corner = corners[i];
    const staffed = O.isStaffed(ops(), cityId, i);
    const look1 = O.cornerOutlook(cityId, i);
    return `<div class="row">
        <div class="row-main">
          <div class="row-name">${corner.name}</div>
          <div class="row-sub">${tierPill(corner.tier)} · about ${look1.cups} cups a day</div>
        </div>
        <button class="chip ${staffed ? 'chip-on' : ''}"
                data-act="${staffed ? 'close-stand' : 'hire-staff'}" data-city="${cityId}" data-index="${i}"
                ${!staffed && campaign.treasury < O.STAFF_HIRE_COST ? 'disabled' : ''}>
          ${staffed ? 'Staffed ✓' : `Hire ${money(O.STAFF_HIRE_COST)}`}
        </button>
      </div>`;
  }).join('');

  return {
    body: `
      ${backBar('Operations', 'to-ops')}
      <h1>${city.flag} ${city.name}</h1>
      <div class="card">
        <h2>Depot</h2>
        ${bar(O.stockTotal(depot) / depot.capacity, look && look.daysOfStock <= 2 ? 'bar-warn' : '')}
        <p class="muted" style="margin-top:8px">${O.stockTotal(depot)} of ${depot.capacity} units held${
          look ? ` · about <strong>${look.daysOfStock}</strong> day${look.daysOfStock === 1 ? '' : 's'} of stock` : ''}</p>
        ${stockRow('lemons', 'Lemons 🍋')}
        ${stockRow('sugar', 'Sugar 🥄')}
        ${stockRow('cups', 'Paper cups 🥤')}
        <div class="total">
          <span>${units} units${discount < 1 ? ` · ${Math.round((1 - discount) * 100)}% bulk discount` : ''}</span>
          <span class="${cost > campaign.treasury || units > space ? 'over' : ''}">${money(cost)}</span>
        </div>
        <div class="chip-row" style="margin-top:12px">
          <button class="chip" data-act="restock-preset" data-days="7">7 days</button>
          <button class="chip" data-act="restock-preset" data-days="14">14 days</button>
          <button class="chip" data-act="restock-preset" data-days="fill">Fill depot</button>
          <button class="chip" data-act="clear-restock">Clear</button>
        </div>
        ${units > space ? `<p class="warn" style="margin-top:10px">Only ${space} units of space left.</p>` : ''}
      </div>
      <div class="card">
        <h2>Corners you own here</h2>
        ${staffRows || '<p class="muted">No claimed corners in this city yet.</p>'}
        <p class="muted" style="margin-top:10px">Staff cost ${money(O.STAFF_WAGE)} a day each, and the depot ${money(O.WAREHOUSE_UPKEEP)} a day — paid whether they sell or not.</p>
      </div>
      ${look ? `<div class="card">
        <h2>Every day, as things stand</h2>
        <div class="facts">
          ${fact('Cups', look.cups)}
          ${fact('Takings', money(look.revenue), 'good')}
          ${fact('Stock used', money(look.stockCost))}
          ${fact('Net', money(look.net), look.net >= 0 ? 'good' : 'bad')}
        </div>
      </div>` : ''}`,
    actions: `
      <button class="btn" data-act="confirm-restock" data-city="${cityId}"
        ${units === 0 || cost > campaign.treasury || units > space ? 'disabled' : ''}>
        ${units ? `Order ${units} units · ${money(cost)}` : 'Order Stock'}
      </button>
      <button class="btn-ghost" data-act="upgrade-depot" data-city="${cityId}"
        ${campaign.treasury < O.CAPACITY_UPGRADE_COST ? 'disabled' : ''}>
        Expand Depot · ${money(O.CAPACITY_UPGRADE_COST)} for +${O.CAPACITY_UPGRADE_STEP}
      </button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

const emptyRestock = () => ({ lemons: 0, sugar: 0, cups: 0 });

function restockForDays(days) {
  const campaign = store.campaign;
  const cityId = store.ui.cityId;
  const depot = ops().warehouses[cityId];
  const staffed = O.staffedIn(ops(), cityId);
  if (!depot || staffed.length === 0) return;
  const look = O.cityOutlook(campaign, cityId);

  let order = {
    lemons: Math.max(0, look.needs.lemons * days - depot.stock.lemons),
    sugar: Math.max(0, look.needs.sugar * days - depot.stock.sugar),
    cups: Math.max(0, look.needs.cups * days - depot.stock.cups),
  };
  order = trimToFit(order, O.spaceLeft(depot), campaign.treasury);
  store.ui.restock = order;
}

/** Fill the depot to the brim with a balanced order, within budget. */
function fillDepot() {
  const campaign = store.campaign;
  const cityId = store.ui.cityId;
  const depot = ops().warehouses[cityId];
  if (!depot) return;
  const space = O.spaceLeft(depot);
  // Two cups per lemon and per sugar is the shape of the recipe.
  const unitsPerSet = 4; // 1 lemon + 1 sugar + 2 cups
  const sets = Math.floor(space / unitsPerSet);
  let order = { lemons: sets, sugar: sets, cups: sets * 2 };
  order = trimToFit(order, space, campaign.treasury);
  store.ui.restock = order;
}

function trimToFit(order, space, budget) {
  let scale = 1;
  const units = () => Math.round(order.lemons * scale) + Math.round(order.sugar * scale) + Math.round(order.cups * scale);
  const cost = () => O.restockCost({
    lemons: Math.round(order.lemons * scale),
    sugar: Math.round(order.sugar * scale),
    cups: Math.round(order.cups * scale),
  });
  let guard = 60;
  while ((units() > space || cost() > budget) && scale > 0.01 && guard-- > 0) scale *= 0.9;
  return {
    lemons: Math.round(order.lemons * scale),
    sugar: Math.round(order.sugar * scale),
    cups: Math.round(order.cups * scale),
  };
}

export const screens = {
  ops: opsScreen,
  opsCity: opsCityScreen,
};

export const actions = {
  'open-ops': () => { store.ui.view = 'ops'; store.ui.opsReport = null; },
  'to-ops': () => { store.ui.view = 'ops'; store.ui.restock = emptyRestock(); },
  'open-ops-city': (el) => {
    store.ui.cityId = el.dataset.city;
    store.ui.restock = emptyRestock();
    store.ui.view = 'opsCity';
  },
  'buy-depot': (el) => {
    const result = O.buyWarehouse(store.campaign, el.dataset.city);
    store.ui.notice = result.ok ? null : result.why;
  },
  'upgrade-depot': (el) => {
    const result = O.upgradeWarehouse(store.campaign, el.dataset.city);
    store.ui.notice = result.ok ? null : result.why;
  },
  'hire-staff': (el) => {
    const result = O.hireStaff(store.campaign, el.dataset.city, Number(el.dataset.index));
    store.ui.notice = result.ok ? null : result.why;
  },
  'close-stand': (el) => O.closeStand(store.campaign, el.dataset.city, Number(el.dataset.index)),
  'restock-preset': (el) => {
    if (el.dataset.days === 'fill') fillDepot();
    else restockForDays(Number(el.dataset.days));
  },
  'clear-restock': () => { store.ui.restock = emptyRestock(); },
  'confirm-restock': (el) => {
    const result = O.restock(store.campaign, el.dataset.city, store.ui.restock);
    if (result.ok) store.ui.restock = emptyRestock();
    else store.ui.notice = result.why;
  },
};
