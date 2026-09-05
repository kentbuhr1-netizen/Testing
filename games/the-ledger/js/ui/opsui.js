/**
 * The Ledger — the network: branches, vaults and standing managers.
 */
import { store } from '../store.js';
import * as C from '../campaign.js';
import * as O from '../ops.js';
import { money, whole, pct, fact, bar, stepper, backBar } from './kit.js';

const CASH_STEP = 250;

function ops() {
  const campaign = store.campaign;
  const opsState = campaign.ops;
  const outlook = O.networkOutlook(campaign);

  const rows = C.TOWNS
    .filter((t) => C.heldIn(campaign, t.id).length > 0)
    .map((t) => {
      const branch = opsState.branches[t.id];
      const managers = O.managersIn(opsState, t.id).length;
      const held = C.heldIn(campaign, t.id).length;
      return `
        <button class="tile" data-act="openOpsTown" data-town="${t.id}">
          <span class="tile-flag">${t.icon}</span>
          <span class="tile-main">
            <span class="tile-name">${t.name}</span>
            <span class="tile-sub">${branch
              ? `${whole(branch.cash)} in the vault · standing ${pct(branch.standing)} · ${managers} manager${managers === 1 ? '' : 's'}`
              : 'No branch'}</span>
          </span>
          <span class="tile-meter">
            <span class="tile-count">${managers}/${held}</span>
            ${bar(branch ? branch.standing : 0, branch && branch.standing < 0.4 ? 'bar-bad' : '')}
          </span>
        </button>`;
    }).join('');

  return {
    body: `
      ${backBar('The country', 'backWorld')}
      <h1 class="title">🏛️ The network</h1>
      <p class="sub">Runs one day for every week you work a book yourself</p>

      ${opsState.alerts.length ? `<div class="warn">${opsState.alerts.join('<br />')}</div>` : ''}

      <section class="facts">
        ${fact('Bank', whole(campaign.treasury), campaign.treasury < 0 ? 'bad' : '')}
        ${fact('Managers', outlook.managers)}
        ${fact('Per day', money(outlook.net), outlook.net >= 0 ? 'good' : 'bad')}
        ${fact('Cash out / day', whole(outlook.working))}
      </section>

      <section class="card">
        <p class="muted small">Wages and upkeep are owed every day, funded or not. A branch whose
        vault runs dry has to turn somebody away — and <strong>its standing goes that morning</strong>,
        then climbs back ${Math.round(O.STANDING_REBUILD * 100)} points a day and no faster. A branch
        earns in proportion to its standing, so there is nothing you can buy to hurry it.</p>
      </section>

      <div class="tiles">${rows || '<p class="muted">Hold some books first.</p>'}</div>
    `,
  };
}

function opsTown() {
  const campaign = store.campaign;
  const opsState = campaign.ops;
  const townId = store.ui.townId;
  const t = C.getTown(townId);
  const branch = opsState.branches[townId];
  const held = C.heldIn(campaign, townId);
  const shipment = store.ui.shipment;
  const carriage = O.carriageCost(shipment.cash);

  const books = C.booksFor(townId);
  const managerRows = held.map((i) => {
    const book = books[i];
    const staffed = O.isStaffed(opsState, townId, i);
    const o = O.bookOutlook(townId, i);
    return `
      <div class="row">
        <div class="row-main">
          <div class="row-name">${book.name}</div>
          <div class="row-sub">${money(o.margin)}/day at full standing · ${money(o.wage)} wages ·
            ${whole(o.working)} a day out of the vault</div>
        </div>
        ${staffed
          ? `<button class="chip danger" data-act="dismissManager" data-index="${i}">Dismiss</button>`
          : O.hasBranch(campaign.ops, store.ui.townId)
            ? `<button class="chip" data-act="hireManager" data-index="${i}"
                     ${campaign.treasury < O.MANAGER_HIRE_COST ? 'disabled' : ''}>${whole(O.MANAGER_HIRE_COST)}</button>`
            : `<span class="muted row-note">Needs a branch</span>`}
      </div>`;
  }).join('');

  return {
    body: `
      ${backBar('The network', 'backOps')}
      <h1 class="title">${t.icon} ${t.name}</h1>
      <p class="sub">Bank ${money(campaign.treasury)}</p>

      <section class="card">
        <h2 class="card-title">Branch</h2>
        ${branch ? `
          <div class="row">
            <div class="row-main">
              <div class="row-name">${whole(branch.cash)} in the vault</div>
              <div class="row-sub">of ${whole(branch.capacity)} · upkeep ${money(O.BRANCH_UPKEEP)}/day</div>
            </div>
            <div class="row-meter">${bar(branch.cash / branch.capacity)}</div>
          </div>
          <div class="row">
            <div class="row-main">
              <div class="row-name">Standing ${pct(branch.standing)}</div>
              <div class="row-sub">${branch.suspended
                ? 'Suspended payment. It will take a long time to live down.'
                : 'Climbs while the branch keeps paying everybody'}</div>
            </div>
            <div class="row-meter">${bar(branch.standing, branch.standing < 0.4 ? 'bar-bad' : '')}</div>
          </div>
          <button class="btn wide" data-act="upgradeVault"
                  ${campaign.treasury < O.VAULT_UPGRADE_COST ? 'disabled' : ''}>
            +${whole(O.VAULT_UPGRADE_STEP)} vault · ${whole(O.VAULT_UPGRADE_COST)}
          </button>
          <button class="btn ghost wide danger" data-act="closeBranch">Close this branch</button>
        ` : `
          <p class="muted">No branch here. Open one and it starts at ${pct(O.STANDING_START)} standing —
          it will lose money until the town knows it.</p>
          <button class="btn wide" data-act="openBranch"
                  ${campaign.treasury < O.BRANCH_COST ? 'disabled' : ''}>
            Open a branch · ${whole(O.BRANCH_COST)}
          </button>`}
      </section>

      ${branch ? `
      <section class="card">
        <h2 class="card-title">Send cash out</h2>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Carriage ${money(carriage)}</div>
            <div class="row-sub">Vault has room for ${whole(O.spaceLeft(branch))} more</div>
          </div>
          ${stepper('shipment', 'cash', shipment.cash, CASH_STEP, 0, 999999, whole(shipment.cash))}
        </div>
        <button class="btn wide primary" data-act="shipCash" ${shipment.cash <= 0 ? 'disabled' : ''}>
          Send · ${money(shipment.cash + carriage)}
        </button>
        <p class="muted small">Cash stacks in a vault as high as you like. Standing does not —
        that is the whole difference.</p>
      </section>` : ''}

      <section class="card">
        <h2 class="card-title">Managers</h2>
        ${managerRows || '<p class="muted">No books held here yet.</p>'}
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
    store.ui.shipment = { cash: 0 };
    store.ui.view = 'opsTown';
  },
  backOps() { store.ui.view = 'ops'; },

  openBranch() { flash(O.openBranch(store.campaign, store.ui.townId)); },
  upgradeVault() { flash(O.upgradeVault(store.campaign, store.ui.townId)); },
  closeBranch() {
    const result = O.closeBranch(store.campaign, store.ui.townId);
    flash(result);
    if (result.ok) {
      store.ui.notice = `Branch closed. ${money(result.returned)} came home; the standing did not.`;
      store.ui.view = 'ops';
    }
  },

  shipCash() {
    const result = O.shipCash(store.campaign, store.ui.townId, store.ui.shipment.cash);
    flash(result);
    if (result.ok) store.ui.shipment = { cash: 0 };
  },

  hireManager(el) { flash(O.hireManager(store.campaign, store.ui.townId, Number(el.dataset.index))); },
  dismissManager(el) { flash(O.dismissManager(store.campaign, store.ui.townId, Number(el.dataset.index))); },
};
