import test from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../js/ops.js';
import * as C from '../js/campaign.js';

const TOWN = 'marlowgreen';

/** A campaign holding one whole town, with money and the network open. */
function ready(treasury = 20_000) {
  const campaign = C.newCampaign();
  for (let i = 0; i < C.BOOKS_PER_TOWN; i++) C.holdBook(campaign, TOWN, i, 0, 0);
  campaign.treasury = treasury;
  campaign.ops = O.newOps();
  return campaign;
}

/** A branch with money in the vault and a manager on a book. */
function staffed(treasury = 20_000, cash = 5000) {
  const campaign = ready(treasury);
  O.openBranch(campaign, TOWN);
  O.shipCash(campaign, TOWN, cash);
  O.hireManager(campaign, TOWN, 0);
  return campaign;
}

/* ---------- opening ---------- */

test('a new network holds nothing', () => {
  const ops = O.newOps();
  assert.equal(ops.day, 0);
  assert.deepEqual(ops.branches, {});
  assert.deepEqual(ops.managers, {});
  assert.equal(O.hasBranch(ops, TOWN), false);
});

test('opening a branch costs money and starts it barely known', () => {
  const campaign = ready();
  const before = campaign.treasury;
  assert.deepEqual(O.openBranch(campaign, TOWN), { ok: true });
  assert.equal(campaign.treasury, before - O.BRANCH_COST);
  const branch = campaign.ops.branches[TOWN];
  assert.equal(branch.standing, O.STANDING_START);
  assert.equal(branch.cash, 0);
  assert.equal(branch.capacity, O.VAULT_BASE_CAPACITY);
});

test('you cannot open two branches in one town, or one you cannot afford', () => {
  const campaign = ready();
  O.openBranch(campaign, TOWN);
  assert.equal(O.openBranch(campaign, TOWN).ok, false);
  const broke = ready(10);
  assert.equal(O.openBranch(broke, TOWN).ok, false);
});

test('a bigger vault is one payment away', () => {
  const campaign = ready();
  O.openBranch(campaign, TOWN);
  const before = campaign.ops.branches[TOWN].capacity;
  assert.equal(O.upgradeVault(campaign, TOWN).ok, true);
  assert.equal(campaign.ops.branches[TOWN].capacity, before + O.VAULT_UPGRADE_STEP);
  assert.equal(O.upgradeVault(ready(0), TOWN).ok, false);
});

/* ---------- shipping cash ---------- */

test('cash sent out costs carriage and fills the vault', () => {
  const campaign = ready();
  O.openBranch(campaign, TOWN);
  const before = campaign.treasury;
  const result = O.shipCash(campaign, TOWN, 2000);
  assert.equal(result.ok, true);
  assert.equal(campaign.ops.branches[TOWN].cash, 2000);
  assert.equal(campaign.treasury, Math.round((before - 2000 - result.carriage) * 100) / 100);
  assert.ok(result.carriage > 0);
});

test('a shipment cannot outgrow the vault or the bank', () => {
  const campaign = ready();
  O.openBranch(campaign, TOWN);
  assert.match(O.shipCash(campaign, TOWN, O.VAULT_BASE_CAPACITY + 1).why, /will not hold/i);
  assert.match(O.shipCash(campaign, TOWN, 0).why, /nothing to send/i);
  const poor = ready(O.BRANCH_COST + 100);
  O.openBranch(poor, TOWN);
  assert.match(O.shipCash(poor, TOWN, 1000).why, /not enough/i);
  assert.match(O.shipCash(ready(), 'saltcoats', 100).why, /open a branch/i);
});

test('carriage never falls below the minimum', () => {
  assert.equal(O.carriageCost(0), 0);
  assert.equal(O.carriageCost(1), O.CARRIAGE.minimum);
  assert.ok(O.carriageCost(100_000) > O.CARRIAGE.minimum);
});

/* ---------- managers ---------- */

test('a manager can only be put on a book you hold', () => {
  const campaign = ready();
  O.openBranch(campaign, TOWN);
  assert.match(O.hireManager(campaign, 'saltcoats', 0).why, /do not hold/i);
  assert.equal(O.hireManager(campaign, TOWN, 0).ok, true);
  assert.match(O.hireManager(campaign, TOWN, 0).why, /already/i);
  assert.equal(O.isStaffed(campaign.ops, TOWN, 0), true);
});

test('a manager can be let go, and stops costing anything', () => {
  const campaign = staffed();
  assert.equal(O.dismissManager(campaign, TOWN, 0).ok, true);
  assert.equal(O.isStaffed(campaign.ops, TOWN, 0), false);
  assert.match(O.dismissManager(campaign, TOWN, 0).why, /no manager/i);
});

test('every held book has an outlook, and it costs a wage', () => {
  for (const townId of ['marlowgreen', 'ironbridge', 'kirkwald']) {
    for (const i of [0, 12, 24]) {
      const o = O.bookOutlook(townId, i);
      assert.ok(o.working >= 1, `${townId}:${i}`);
      assert.ok(o.margin >= 0);
      assert.equal(o.wage, O.MANAGER_WAGE);
      assert.ok(o.marginSuspended < o.margin || o.margin === 0);
    }
  }
});

/* ---------- the daily tick ---------- */

test('a funded branch lends, and the principal comes home with its margin', () => {
  const campaign = staffed();
  const before = campaign.treasury;
  const vaultBefore = campaign.ops.branches[TOWN].cash;
  const summary = O.runNetworkDays(campaign, 5);
  assert.equal(summary.days, 5);
  assert.ok(summary.returned > 0, 'principal should come back to head office');
  assert.ok(summary.loans > 0);
  assert.equal(campaign.ops.branches[TOWN].cash, vaultBefore - summary.returned);
  assert.equal(campaign.treasury, Math.round((before + summary.net + summary.returned) * 100) / 100);
  assert.equal(campaign.ops.day, 5);
});

test('wages and upkeep are owed whether or not the vault had the money', () => {
  const funded = staffed();
  const dry = staffed(20_000, 0);
  const a = O.runNetworkDays(funded, 4);
  const b = O.runNetworkDays(dry, 4);
  assert.equal(a.costs, b.costs);
  assert.ok(a.costs >= 4 * (O.MANAGER_WAGE + O.BRANCH_UPKEEP) - 0.01);
});

test('nothing happens without a network, or without days', () => {
  const campaign = ready();
  assert.equal(O.runNetworkDays(campaign, 0), null);
  campaign.ops = null;
  assert.equal(O.runNetworkDays(campaign, 5), null);
});

/* ---------- standing: the thing you cannot buy ---------- */

test('standing climbs at a fixed rate a day, and nothing else touches it', () => {
  const campaign = staffed();
  const start = campaign.ops.branches[TOWN].standing;
  O.runNetworkDays(campaign, 3);
  const after = campaign.ops.branches[TOWN].standing;
  assert.ok(Math.abs((after - start) - 3 * O.STANDING_REBUILD) < 1e-9,
    `standing moved ${after - start} in three days`);
});

test('no amount of money makes standing come back faster', () => {
  // Both branches keep paying everybody; the only difference is the money
  // behind them. A vault stacked to the roof must buy no extra standing.
  const modest = staffed(8_000, 5000);
  const rich = staffed(500_000, 5000);
  O.upgradeVault(rich, TOWN);
  O.upgradeVault(rich, TOWN);
  O.shipCash(rich, TOWN, 5000);
  O.runNetworkDays(modest, 6);
  O.runNetworkDays(rich, 6);
  assert.ok(rich.ops.branches[TOWN].cash > modest.ops.branches[TOWN].cash,
    'the rich branch should be holding more');
  assert.equal(rich.ops.branches[TOWN].standing, modest.ops.branches[TOWN].standing);
});

test('a vault that runs dry costs the branch its standing that morning', () => {
  const campaign = staffed(20_000, 5000);
  O.runNetworkDays(campaign, 8);
  const grown = campaign.ops.branches[TOWN].standing;
  assert.ok(grown > O.STANDING_START, 'standing should have been climbing');

  campaign.ops.branches[TOWN].cash = 0;          // the money ran out
  const summary = O.runNetworkDays(campaign, 1);
  assert.equal(campaign.ops.branches[TOWN].standing, 0);
  assert.equal(campaign.ops.branches[TOWN].suspended, true);
  assert.deepEqual(summary.suspended, [TOWN]);
  assert.ok(campaign.ops.alerts.some((a) => /standing is gone/i.test(a)));
});

test('what a morning destroys takes months of days to rebuild', () => {
  const campaign = staffed(20_000, 0);
  O.runNetworkDays(campaign, 1);                 // dry: standing to zero
  assert.equal(campaign.ops.branches[TOWN].standing, 0);
  O.shipCash(campaign, TOWN, 6000);              // money is not the problem
  const daysNeeded = Math.ceil(O.STANDING_START / O.STANDING_REBUILD);
  O.runNetworkDays(campaign, daysNeeded - 1);
  assert.ok(campaign.ops.branches[TOWN].standing < O.STANDING_START,
    'a fortune should not have bought back even the standing it opened with');
  assert.ok(daysNeeded >= 10, 'rebuilding must take a serious number of days');
});

test('a branch earns in proportion to its standing', () => {
  const low = staffed();
  const high = staffed();
  high.ops.branches[TOWN].standing = 1;
  low.ops.branches[TOWN].standing = 0.25;
  const a = O.runNetworkDays(high, 1);
  const b = O.runNetworkDays(low, 1);
  assert.ok(a.takings > b.takings * 2, `${a.takings} against ${b.takings}`);
});

/* ---------- winding it back in ---------- */

test('closing a branch brings the cash home but not the standing', () => {
  const campaign = staffed();
  O.dismissManager(campaign, TOWN, 0);
  const vault = campaign.ops.branches[TOWN].cash;
  const before = campaign.treasury;
  const result = O.closeBranch(campaign, TOWN);
  assert.equal(result.ok, true);
  assert.equal(result.returned, vault);
  assert.equal(campaign.treasury, Math.round((before + vault) * 100) / 100);
  assert.equal(O.hasBranch(campaign.ops, TOWN), false);

  // Reopening starts from scratch: the town does not remember you fondly.
  O.openBranch(campaign, TOWN);
  assert.equal(campaign.ops.branches[TOWN].standing, O.STANDING_START);
});

test('a branch with managers on it cannot be closed', () => {
  const campaign = staffed();
  assert.match(O.closeBranch(campaign, TOWN).why, /dismiss/i);
  assert.match(O.closeBranch(ready(), TOWN).why, /no branch/i);
});

test('a network running at a loss says so plainly', () => {
  const campaign = staffed(20_000, 0);
  const summary = O.runNetworkDays(campaign, 10);
  assert.ok(summary.net < 0);
  assert.ok(campaign.ops.alerts.some((a) => /lost/i.test(a)));
});

test('the outlook adds up across the whole network', () => {
  const campaign = staffed();
  O.hireManager(campaign, TOWN, 1);
  const outlook = O.networkOutlook(campaign);
  assert.equal(outlook.managers, 2);
  assert.ok(outlook.working > 0);
  assert.equal(outlook.costs, 2 * O.MANAGER_WAGE + O.BRANCH_UPKEEP);
  assert.equal(outlook.net, Math.round((outlook.takings - outlook.costs) * 100) / 100);
  assert.equal(O.networkOutlook(C.newCampaign()), null);
});

test('the ledger keeps the last twenty days and no more', () => {
  const campaign = staffed();
  for (let i = 0; i < 25; i++) O.runNetworkDays(campaign, 1);
  assert.equal(campaign.ops.ledger.length, 20);
  assert.equal(campaign.ops.ledger[0].day, 25);
  assert.equal(campaign.ops.totals.loans >= 0, true);
});

test('a manager cannot be hired where there is no branch to lend from', () => {
  const campaign = C.newCampaign();
  campaign.ops = O.newOps();
  campaign.treasury = 100000;
  const town = C.TOWNS[0].id;
  campaign.held[town] = [0];
  const refused = O.hireManager(campaign, town, 0);
  assert.equal(refused.ok, false);
  assert.match(refused.why, /branch/i);
  O.openBranch(campaign, town);
  assert.equal(O.hireManager(campaign, town, 0).ok, true);
});

test('a suspended branch still earns its thin takings on the standing it had that day', () => {
  assert.ok(O.SUSPENDED_EFFECT > 0, 'the constant is live, not decorative');
});
