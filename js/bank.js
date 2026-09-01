/**
 * Lemonade Stand — the bank.
 *
 * A place to park treasury cash so it earns interest while you are out
 * working a corner, instead of just sitting there. Interest accrues once
 * per settled run, compounded for exactly the days that run took — the
 * same "a day played by hand is a day everywhere" rule that drives the
 * supply network in ops.js, so idle capital and an idle empire grow on
 * the same clock.
 */

export const DAILY_RATE = 0.005; // ~0.5%/day compounded — generous on purpose, this is a phone game

const round2 = (n) => Math.round(n * 100) / 100;

export function newBank() {
  return { balance: 0, hasDeposited: false };
}

/** Fills in a bank account for a save made before this feature existed. */
export function ensureBank(campaign) {
  if (!campaign.bank) campaign.bank = newBank();
  if (campaign.bank.hasDeposited == null) campaign.bank.hasDeposited = campaign.bank.balance > 0;
  return campaign.bank;
}

export function deposit(campaign, amount) {
  ensureBank(campaign);
  const amt = round2(Math.max(0, amount));
  if (amt <= 0) return { ok: false, why: 'Nothing to deposit.' };
  if (amt > campaign.treasury) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - amt);
  campaign.bank.balance = round2(campaign.bank.balance + amt);
  campaign.bank.hasDeposited = true;
  return { ok: true };
}

export function withdraw(campaign, amount) {
  ensureBank(campaign);
  const amt = round2(Math.max(0, amount));
  if (amt <= 0) return { ok: false, why: 'Nothing to withdraw.' };
  if (amt > campaign.bank.balance) return { ok: false, why: 'Not enough in the bank.' };
  campaign.bank.balance = round2(campaign.bank.balance - amt);
  campaign.treasury = round2(campaign.treasury + amt);
  return { ok: true };
}

/**
 * Compound the bank balance for `days` days. Called once per settled run
 * with the number of days that run actually took, campaign or free play
 * alike. Returns the interest earned, for a report line.
 */
export function accrueInterest(campaign, days) {
  ensureBank(campaign);
  const before = campaign.bank.balance;
  if (before <= 0 || days <= 0) return 0;
  const after = round2(before * Math.pow(1 + DAILY_RATE, days));
  campaign.bank.balance = after;
  return round2(after - before);
}
