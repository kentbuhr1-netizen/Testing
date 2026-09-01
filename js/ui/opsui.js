/** Operations: the depot network, wholesale buying and staffed corners. */
import * as C from '../campaign.js';
import * as O from '../ops.js';
import { store } from '../store.js';
import { money, whole, fact, bar, backBar, row, stepper, tierPill } from './kit.js';

const ops = () => store.campaign.ops;

const CARGO_ICON = { lemons: '🍋', sugar: '🥄', cups: '🥤' };
const CARGO_LABEL = { lemons: 'lemons', sugar: 'sugar', cups: 'paper cups' };

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

  const editing = store.ui.editingTruck != null ? ops().trucks.find((t) => t.id === store.ui.editingTruck) : null;

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
      ${editing ? truckEditorCard(editing) : trucksCard()}
      <div class="city-list">${rows || '<p class="muted center">Claim some corners first.</p>'}</div>`,
    actions: editing
      ? `<button class="btn" data-act="confirm-truck-route" ${store.ui.truckDraft.from && store.ui.truckDraft.to ? '' : 'disabled'}>Set Route</button>
         <button class="btn-ghost" data-act="cancel-truck-edit">Cancel</button>`
      : `<button class="btn" data-act="to-world">Back to the Map</button>`,
  };
}

function truckRouteLabel(truck) {
  if (!truck.from || !truck.to) return 'Not assigned yet';
  const from = C.getCity(truck.from);
  const to = C.getCity(truck.to);
  return `${from.flag} ${from.name} → ${to.flag} ${to.name} · ${truck.amount} ${CARGO_LABEL[truck.cargo]}/day`;
}

function trucksCard() {
  const trucks = ops().trucks;
  const rows = trucks.map((truck) => `
    <div class="row">
      <div class="row-main">
        <div class="row-name">Truck #${truck.id}</div>
        <div class="row-sub">${truckRouteLabel(truck)}</div>
      </div>
      <button class="chip" data-act="edit-truck" data-truck="${truck.id}">${truck.from ? 'Reroute' : 'Assign'}</button>
    </div>`).join('');

  return `
    <div class="card">
      <h2>Trucks</h2>
      ${rows || '<p class="muted">No trucks yet — buy one to start hauling stock between your depots.</p>'}
      <div class="chip-row" style="margin-top:10px">
        <button class="chip" data-act="buy-truck" ${store.campaign.treasury < O.TRUCK_COST ? 'disabled' : ''}>
          🚚 Buy Truck · ${money(O.TRUCK_COST)}
        </button>
      </div>
      <p class="muted" style="margin-top:10px">A truck hauls one good between two depots every day, for ${money(O.TRUCK_UPKEEP)} a day while it has a route.</p>
    </div>`;
}

function truckEditorCard(truck) {
  const depotCities = C.CITIES.filter((c) => O.hasWarehouse(ops(), c.id));
  const draft = store.ui.truckDraft;
  const cityChip = (city, group) => `
    <button class="chip ${draft[group] === city.id ? 'chip-on' : ''}" data-act="truck-pick-${group}" data-city="${city.id}">
      ${city.flag} ${city.name}
    </button>`;

  return `
    <div class="card">
      <h2>Route for Truck #${truck.id}</h2>
      ${depotCities.length < 2
        ? '<p class="muted">You need depots in at least two cities before a truck has anywhere to run.</p>'
        : `
          <p class="row-sub">Pick up in</p>
          <div class="chip-row">${depotCities.map((c) => cityChip(c, 'from')).join('')}</div>
          <p class="row-sub" style="margin-top:12px">Drop off in</p>
          <div class="chip-row">${depotCities.filter((c) => c.id !== draft.from).map((c) => cityChip(c, 'to')).join('')}</div>
          <p class="row-sub" style="margin-top:12px">Cargo</p>
          <div class="chip-row">
            ${O.TRUCK_CARGO.map((cargo) => `
              <button class="chip ${draft.cargo === cargo ? 'chip-on' : ''}" data-act="truck-pick-cargo" data-cargo="${cargo}">
                ${CARGO_ICON[cargo]} ${CARGO_LABEL[cargo]}
              </button>`).join('')}
          </div>
          ${row('Amount per day', null, stepper('truckDraft', 'amount', draft.amount, 25, 25, 2000))}
        `}
    </div>`;
}

function stockDaysLabel(days) {
  if (!Number.isFinite(days)) return 'production is keeping up — steady supply';
  return `about <strong>${days}</strong> day${days === 1 ? '' : 's'} of stock`;
}

function buildingsCard(campaign, cityId) {
  const rows = Object.values(O.BUILDINGS).map((b) => {
    const built = O.hasBuilding(ops(), cityId, b.id);
    const yieldLabel = b.id === 'iceMaker'
      ? `${b.dailyYield} free ice cubes/day`
      : `${b.dailyYield} ${b.unit}/day`;
    return `<div class="row">
        <div class="row-main">
          <div class="row-name">${b.icon} ${b.label}</div>
          <div class="row-sub">${built ? `Built · ${yieldLabel}` : `${yieldLabel} · ${money(b.upkeep)}/day upkeep`}</div>
        </div>
        ${built
          ? '<span class="chip chip-on">Built ✓</span>'
          : `<button class="chip" data-act="build-building" data-city="${cityId}" data-building="${b.id}"
               ${campaign.treasury < b.cost ? 'disabled' : ''}>Build ${money(b.cost)}</button>`}
      </div>`;
  }).join('');

  return `
    <div class="card">
      <h2>Farms &amp; Factories</h2>
      ${rows}
      <p class="muted" style="margin-top:10px">A farm or factory feeds this depot for free, up to its daily output. The ice maker never stocks ice — it just covers what corners need before they pay street price.</p>
    </div>`;
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
          look ? ` · ${stockDaysLabel(look.daysOfStock)}` : ''}</p>
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
      ${buildingsCard(campaign, cityId)}
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
        ${look.farmSavings > 0 ? `<p class="muted" style="margin-top:8px">Farms and the factory are covering ${money(look.farmSavings)} of that stock for free.</p>` : ''}
        ${look.buildingUpkeep > 0 ? `<p class="muted">Building upkeep: ${money(look.buildingUpkeep)}/day.</p>` : ''}
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
  'build-building': (el) => {
    const result = O.buildBuilding(store.campaign, el.dataset.city, el.dataset.building);
    store.ui.notice = result.ok ? null : result.why;
  },
  'buy-truck': () => {
    const result = O.buyTruck(store.campaign);
    if (result.ok) {
      store.ui.editingTruck = result.id;
      store.ui.truckDraft = { from: null, to: null, cargo: 'lemons', amount: 100 };
    } else {
      store.ui.notice = result.why;
    }
  },
  'edit-truck': (el) => {
    const id = Number(el.dataset.truck);
    const truck = ops().trucks.find((t) => t.id === id);
    if (!truck) return;
    store.ui.editingTruck = id;
    store.ui.truckDraft = { from: truck.from, to: truck.to, cargo: truck.cargo, amount: truck.amount };
  },
  'cancel-truck-edit': () => {
    store.ui.editingTruck = null;
    store.ui.truckDraft = null;
  },
  'truck-pick-from': (el) => {
    store.ui.truckDraft.from = el.dataset.city;
    if (store.ui.truckDraft.to === el.dataset.city) store.ui.truckDraft.to = null;
  },
  'truck-pick-to': (el) => { store.ui.truckDraft.to = el.dataset.city; },
  'truck-pick-cargo': (el) => { store.ui.truckDraft.cargo = el.dataset.cargo; },
  'confirm-truck-route': () => {
    const result = O.assignTruckRoute(store.campaign, store.ui.editingTruck, store.ui.truckDraft);
    if (result.ok) {
      store.ui.editingTruck = null;
      store.ui.truckDraft = null;
    } else {
      store.ui.notice = result.why;
    }
  },
};
