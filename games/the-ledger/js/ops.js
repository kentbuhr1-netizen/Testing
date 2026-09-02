/**
 * The Ledger — the branch network.
 *
 * Unlocked once five towns are complete. Books you already hold can be given
 * a standing manager, funded with cash shipped out from head office, so they
 * keep lending while you work a new book yourself. Campaign days tick with the
 * weeks you play, so the firm grows exactly as fast as you do.
 *
 * Standing is deliberately not for sale. Cash stacks in a vault to the roof
 * and a bigger vault is one payment away, but a branch's standing in its town
 * climbs at a fixed rate per day and is gone the morning it cannot pay
 * somebody — and no amount of money buys it back any faster. That is why a
 * second branch, never a bigger shipment, is the only way to lend more. The
 * same rule that shapes the core game shapes the firm.
 */
import { TOWNS, getTown, booksFor, heldIn, TIERS, mergeMods } from './campaign.js';
import { withMods, riskFor, RATE_BASE, RATE_SPAN, RISK_WEDGE } from './sim.js';

export const BRANCH_COST = 450;             // to open a branch in a town
export const VAULT_BASE_CAPACITY = 6000;    // cash the branch can hold
export const VAULT_UPGRADE_COST = 300;
export const VAULT_UPGRADE_STEP = 4000;
export const MANAGER_HIRE_COST = 120;       // one-off, per book
export const MANAGER_WAGE = 4;              // per manager per day
export const BRANCH_UPKEEP = 3;             // per branch per day

/** How well a standing manager lends compared with you, at full standing. */
export const MANAGER_EFFECT = 0.7;
/** What a branch manages once it has had to turn somebody away. */
export const SUSPENDED_EFFECT = 0.45;

/**
 * How much of a branch's lending head office has to supply.
 *
 * A branch takes deposits of its own, so most of what it lends is raised
 * locally; this is the slice that has to come out in the carriage. It is also
 * the slice that runs out, which is what suspends a branch.
 */
export const HEAD_OFFICE_SHARE = 0.25;

/** Standing a new branch opens with, and the most it can gain in a day. */
export const STANDING_START = 0.3;
export const STANDING_REBUILD = 0.02;

/** Shipping cash out of head office costs something to escort. */
export const CARRIAGE = { rate: 0.008, minimum: 2 };

export function carriageCost(amount) {
  return amount <= 0 ? 0 : Math.round(Math.max(CARRIAGE.minimum, amount * CARRIAGE.rate) * 100) / 100;
}

export function newOps() {
  return {
    day: 0,
    branches: {},     // townId → { capacity, cash, standing, suspended }
    managers: {},     // townId → [bookIndex]
    ledger: [],       // most recent days first
    alerts: [],
    totals: { takings: 0, costs: 0, loans: 0 },
  };
}

export const hasBranch = (ops, townId) => Boolean(ops?.branches?.[townId]);
export const managersIn = (ops, townId) => ops?.managers?.[townId] || [];
export const isStaffed = (ops, townId, i) => managersIn(ops, townId).includes(i);
export const spaceLeft = (branch) => Math.max(0, branch.capacity - branch.cash);

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/* ------------------------------------------------------------------ *
 * What a standing manager does on an average day
 * ------------------------------------------------------------------ */

/**
 * Managers lend on an average day rather than a simulated one: no queue to
 * read, no fright to survive, no file to weigh. They also underwrite worse
 * than an attentive owner — that gap is what you are paid for when you sit at
 * the desk yourself.
 */
export function bookOutlook(townId, bookIndex) {
  const book = booksFor(townId)[bookIndex];
  const townMods = getTown(townId).challenge.mods;
  const mods = withMods(mergeMods(TIERS[book.tier].mods, townMods, book.mods));

  const meanAmount = 210 * mods.loanSize;
  const meanTerm = 7.5 * mods.term;
  const files = 7 * mods.applicants;
  // A manager funds a fixed slice of what walks in, and reads it about as well
  // as an average clerk — which is to say, without much of an edge.
  const written = files * 0.22;
  const lent = written * meanAmount;

  const meanRisk = riskFor(0.52, mods);
  const priced = riskFor(0.52 * RISK_WEDGE, mods) / 0.66;
  const rate = (RATE_BASE + RATE_SPAN * priced * mods.rateSpread) * (meanTerm / 10);
  const pBad = 1 - Math.pow(1 - meanRisk, meanTerm / 10);
  const security = 0.475 * mods.recovery;
  const marginPerLoan = (1 - pBad) * rate - pBad * (1 - security - rate * 0.5);

  // `lent` is the principal that goes out of the vault each day; the margin
  // it earns over the loan's life is credited home when it is written. The
  // principal itself comes home too — that is why the vault drains and head
  // office keeps having to send more out.
  return {
    loans: written,
    working: Math.max(1, Math.round(lent * HEAD_OFFICE_SHARE)),   // sent from head office
    margin: round2(Math.max(0, lent * marginPerLoan * MANAGER_EFFECT)),
    marginSuspended: round2(Math.max(0, lent * marginPerLoan * SUSPENDED_EFFECT)),
    wage: MANAGER_WAGE,
  };
}

/** What the whole network would do in one day, as a preview. */
export function networkOutlook(campaign) {
  const ops = campaign.ops;
  if (!ops) return null;
  let takings = 0, costs = 0, loans = 0, managers = 0, working = 0;
  for (const town of TOWNS) {
    const branch = ops.branches[town.id];
    for (const i of managersIn(ops, town.id)) {
      const o = bookOutlook(town.id, i);
      managers += 1;
      loans += o.loans;
      takings += o.margin * (branch ? branch.standing : 0);
      costs += o.wage;
      working += o.working;
    }
    if (branch) costs += BRANCH_UPKEEP;
  }
  return {
    managers,
    loans: Math.round(loans),
    takings: round2(takings),
    costs: round2(costs),
    net: round2(takings - costs),
    working,
  };
}

/* ------------------------------------------------------------------ *
 * Opening and funding
 * ------------------------------------------------------------------ */

export function openBranch(campaign, townId) {
  const ops = campaign.ops;
  if (hasBranch(ops, townId)) return { ok: false, why: 'There is already a branch in this town.' };
  if (campaign.treasury < BRANCH_COST) return { ok: false, why: 'Not enough in the bank.' };
  campaign.treasury = round2(campaign.treasury - BRANCH_COST);
  ops.branches[townId] = {
    capacity: VAULT_BASE_CAPACITY,
    cash: 0,
    standing: STANDING_START,
    suspended: false,
  };
  return { ok: true };
}

export function upgradeVault(campaign, townId) {
  const branch = campaign.ops?.branches?.[townId];
  if (!branch) return { ok: false, why: 'Open a branch here first.' };
  if (campaign.treasury < VAULT_UPGRADE_COST) return { ok: false, why: 'Not enough in the bank.' };
  campaign.treasury = round2(campaign.treasury - VAULT_UPGRADE_COST);
  branch.capacity += VAULT_UPGRADE_STEP;
  return { ok: true };
}

/**
 * Shut a branch. Whatever is in the vault comes home; the standing does not.
 *
 * Without this a network that over-extends has no way out: wages and upkeep
 * are owed every day whether or not anything is earning, and the bank just
 * falls forever. Closing is the brake.
 */
export function closeBranch(campaign, townId) {
  const ops = campaign.ops;
  if (!hasBranch(ops, townId)) return { ok: false, why: 'There is no branch here.' };
  if (managersIn(ops, townId).length > 0) {
    return { ok: false, why: 'Dismiss this town’s managers before closing its branch.' };
  }
  const returned = ops.branches[townId].cash;
  campaign.treasury = round2(campaign.treasury + returned);
  delete ops.branches[townId];
  return { ok: true, returned };
}

/** Send cash out to a branch vault. Stockpile all you like — it is only money. */
export function shipCash(campaign, townId, amount) {
  const branch = campaign.ops?.branches?.[townId];
  if (!branch) return { ok: false, why: 'Open a branch here first.' };
  const sum = Math.round(amount || 0);
  if (sum <= 0) return { ok: false, why: 'Nothing to send.' };
  if (sum > spaceLeft(branch)) return { ok: false, why: 'The vault will not hold that much.' };
  const cost = round2(sum + carriageCost(sum));
  if (cost > campaign.treasury) return { ok: false, why: 'Not enough in the bank.' };
  campaign.treasury = round2(campaign.treasury - cost);
  branch.cash += sum;
  return { ok: true, cost, carriage: carriageCost(sum) };
}

export function hireManager(campaign, townId, bookIndex) {
  const ops = campaign.ops;
  if (!heldIn(campaign, townId).includes(bookIndex)) {
    return { ok: false, why: 'You do not hold that book.' };
  }
  if (isStaffed(ops, townId, bookIndex)) return { ok: false, why: 'Already has a manager.' };
  if (campaign.treasury < MANAGER_HIRE_COST) return { ok: false, why: 'Not enough in the bank.' };
  campaign.treasury = round2(campaign.treasury - MANAGER_HIRE_COST);
  const list = ops.managers[townId] || (ops.managers[townId] = []);
  list.push(bookIndex);
  list.sort((a, b) => a - b);
  return { ok: true };
}

export function dismissManager(campaign, townId, bookIndex) {
  const list = campaign.ops?.managers?.[townId];
  if (!list) return { ok: false, why: 'No manager there.' };
  const at = list.indexOf(bookIndex);
  if (at < 0) return { ok: false, why: 'No manager there.' };
  list.splice(at, 1);
  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * The daily tick
 * ------------------------------------------------------------------ */

/**
 * Run the network for `days` days — one for every week you spent working a
 * book yourself. Wages and upkeep are owed whether or not the vault had the
 * money, and a branch that cannot fund its lending has to turn somebody away:
 * its standing goes that morning and comes back a hundredth at a time.
 */
export function runNetworkDays(campaign, days) {
  const ops = campaign.ops;
  if (!ops || days <= 0) return null;

  const summary = { days, loans: 0, takings: 0, costs: 0, returned: 0, suspended: [] };
  const dry = new Set();

  for (let d = 0; d < days; d++) {
    ops.day += 1;
    for (const town of TOWNS) {
      const staffed = managersIn(ops, town.id);
      const branch = ops.branches[town.id];
      if (branch) summary.costs += BRANCH_UPKEEP;

      for (const i of staffed) {
        const o = bookOutlook(town.id, i);
        const funded = branch && branch.cash >= o.working;
        if (funded) {
          // Principal out of the vault, principal and margin home again.
          branch.cash = round2(branch.cash - o.working);
          summary.returned += o.working;
          summary.loans += o.loans;
          summary.takings += o.margin * branch.standing;
        } else {
          // A branch that cannot fund its lending has to turn people away,
          // and in this business that is the end of its standing. No amount
          // of money buys it back — only days of not doing it again.
          if (branch) {
            branch.suspended = true;
            branch.standing = 0;
          }
          dry.add(town.id);
          summary.loans += o.loans * (SUSPENDED_EFFECT / MANAGER_EFFECT);
          summary.takings += o.marginSuspended * (branch ? branch.standing : 0);
        }
        summary.costs += o.wage;      // owed either way
      }

      // Standing is the one thing a vault cannot hold. It climbs at a fixed
      // rate, for everyone, and money makes no difference to it at all.
      if (branch && !dry.has(town.id)) {
        branch.standing = clamp(branch.standing + STANDING_REBUILD, 0, 1);
        if (branch.standing >= 1) branch.suspended = false;
      }
    }
  }

  summary.loans = Math.round(summary.loans);
  summary.takings = round2(summary.takings);
  summary.costs = round2(summary.costs);
  summary.net = round2(summary.takings - summary.costs);
  summary.suspended = [...dry];

  summary.returned = round2(summary.returned);
  // The principal comes home as well as the margin; the vault is what empties.
  campaign.treasury = round2(campaign.treasury + summary.net + summary.returned);
  campaign.stats.loansWritten += summary.loans;
  ops.totals.takings = round2(ops.totals.takings + summary.takings);
  ops.totals.costs = round2(ops.totals.costs + summary.costs);
  ops.totals.loans += summary.loans;

  ops.alerts = summary.suspended.map((id) =>
    `${getTown(id).name}: the vault ran dry and the branch turned people away. Its standing is gone.`);
  if (summary.net < 0) {
    ops.alerts.unshift(`The network lost ${'$' + Math.abs(summary.net).toFixed(2)} over ${days} day${days === 1 ? '' : 's'}. Dismiss managers or close a branch.`);
  }
  ops.ledger.unshift({ day: ops.day, ...summary });
  ops.ledger = ops.ledger.slice(0, 20);
  return summary;
}
