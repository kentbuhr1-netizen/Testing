/**
 * Lemonade Stand — the office.
 *
 * Five roles, at most one hire each, unlocked alongside Operations since
 * there is nothing for an office to manage before then. Each is paid like
 * everything else in the empire: once per settled run, for exactly the
 * days that run took — the same clock the bank and the supply network
 * already run on.
 *
 * Every role is a passive multiplier applied exactly where that job would
 * actually show up: finance touches the bank, logistics touches upkeep
 * and wholesale, HR touches wages, flavor science touches what staffed
 * corners earn, and M&A unlocks buying a corner outright instead of
 * playing it.
 */

export const EMPLOYEES = {
  finance:   { id: 'finance',   icon: '💹', title: 'Finance Manager',   cost: 600, wage: 6, blurb: 'Bank balances earn 0.2%/day more interest.' },
  logistics: { id: 'logistics', icon: '🧭', title: 'Logistics Manager', cost: 600, wage: 6, blurb: 'Depot and truck upkeep down 25%. Wholesale orders down 5%.' },
  hr:        { id: 'hr',        icon: '🧑‍💼', title: 'HR Manager',        cost: 500, wage: 5, blurb: 'Staff wages and hiring cost down 25%.' },
  flavor:    { id: 'flavor',    icon: '🧪', title: 'Flavor Scientist',  cost: 700, wage: 7, blurb: 'Staffed corners earn 8% more from a better recipe.' },
  ma:        { id: 'ma',        icon: '🤝', title: 'M&A Specialist',    cost: 900, wage: 9, blurb: 'Unlocks buying out a corner outright, instead of playing it.' },
};

const round2 = (n) => Math.round(n * 100) / 100;

export function newStaff() {
  return {};
}

/** Fills in an office for a save made before this feature existed. */
export function ensureStaff(campaign) {
  if (!campaign.employees) campaign.employees = newStaff();
  return campaign.employees;
}

export const isHired = (campaign, id) => !!campaign?.employees?.[id];

export function hire(campaign, id) {
  ensureStaff(campaign);
  const def = EMPLOYEES[id];
  if (!def) return { ok: false, why: 'No such role.' };
  if (isHired(campaign, id)) return { ok: false, why: 'Already hired.' };
  if (campaign.treasury < def.cost) return { ok: false, why: 'Not enough in the treasury.' };
  campaign.treasury = round2(campaign.treasury - def.cost);
  campaign.employees[id] = true;
  return { ok: true };
}

export function headcount(campaign) {
  const staff = campaign?.employees || {};
  return Object.keys(staff).filter((id) => staff[id]).length;
}

export function dailyWages(campaign) {
  const staff = campaign?.employees || {};
  return Object.keys(staff).filter((id) => staff[id]).reduce((n, id) => n + EMPLOYEES[id].wage, 0);
}

/** Pays every hired employee for `days` days, out of the treasury. Returns the total paid. */
export function payWages(campaign, days) {
  const wage = dailyWages(campaign);
  if (wage <= 0 || days <= 0) return 0;
  const total = round2(wage * days);
  campaign.treasury = round2(campaign.treasury - total);
  return total;
}

// Passive effects — each reads as a multiplier so "not hired" is always 1x,
// the same "off means untouched" rule the rest of the game's economy uses.
export const upkeepMult = (campaign) => (isHired(campaign, 'logistics') ? 0.75 : 1);
export const wholesaleMult = (campaign) => (isHired(campaign, 'logistics') ? 0.95 : 1);
export const wageMult = (campaign) => (isHired(campaign, 'hr') ? 0.75 : 1);
export const hireCostMult = (campaign) => (isHired(campaign, 'hr') ? 0.75 : 1);
export const flavorMult = (campaign) => (isHired(campaign, 'flavor') ? 1.08 : 1);
export const interestBonus = (campaign) => (isHired(campaign, 'finance') ? 0.002 : 0);
export const hasMA = (campaign) => isHired(campaign, 'ma');
