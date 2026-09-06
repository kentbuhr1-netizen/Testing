/**
 * Outbreak's bonus list.
 *
 * The shop itself — the ad gate, the cooldowns, the screen and the
 * disclaimer — is the shared shell in js/bonusshop/, identical in every game
 * in the series. All that belongs here is what a small boost means to a
 * district fighting an outbreak, and when it is worth offering.
 *
 * Every bonus is a top-up, not a lever: nothing here changes how the disease
 * spreads or what a week costs. If four ads ever beat allocating well, the
 * rewards here are too big.
 */
import { store, render } from '../store.js';
import { createBonusShop } from '../bonusshop/shell.js';
import * as S from '../sim.js';
import { money, lives } from './kit.js';

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const inDistrict = () => (store.run && store.run.phase !== 'gameover'
  ? { ok: true }
  : { ok: false, why: 'Only useful mid-district — start one first.' });

/** A grant is sized to the district, so a village and a city both feel it. */
const grantFor = (r) => round2(Math.max(0.25, r.baseFunds * 0.08));

const BONUSES = [
  {
    id: 'grant',
    icon: '💰',
    title: 'Emergency Grant',
    describe: () => (store.run ? `+${money(grantFor(store.run))} into this week’s budget.` : 'A one-off top-up to the budget.'),
    available: inDistrict,
    apply: () => { store.run.funds = round2(store.run.funds + grantFor(store.run)); },
  },
  {
    id: 'refund',
    icon: '🧾',
    title: 'Audit Refund',
    describe: () => {
      const last = store.run?.history?.at(-1);
      return last ? `A quarter of last week’s ${money(last.spend)} programme, found and returned.` : 'A quarter of last week’s spend, returned.';
    },
    available: () => {
      const s = inDistrict();
      if (!s.ok) return s;
      const last = store.run.history.at(-1);
      return last && last.spend > 0 ? { ok: true } : { ok: false, why: 'Nothing was spent last week.' };
    },
    apply: () => {
      const r = store.run;
      r.funds = round2(r.funds + 0.25 * r.history.at(-1).spend);
    },
  },
  {
    id: 'fieldward',
    icon: '⛺',
    title: 'Field Ward',
    describe: () => (store.run
      ? `${lives(store.run.pop * S.BED_PER_LEVEL)} beds under canvas, open now — and no staffing bill, ever.`
      : 'A tent ward, open now, with no staffing bill.'),
    available: inDistrict,
    apply: () => {
      // Capacity without builtBeds: a ward that is never on the payroll, and
      // therefore never something the budget has to close.
      const r = store.run;
      r.bedCapacity += r.pop * S.BED_PER_LEVEL;
    },
  },
  {
    id: 'airlift',
    icon: '✈️',
    title: 'Vaccine Airlift',
    describe: () => 'A week’s worth of doses, landing next week rather than after the usual lag.',
    available: inDistrict,
    apply: () => {
      const r = store.run;
      const doses = r.pop * S.VAX_PER_LEVEL;
      r.vaxQueue.push({ week: r.week + 1, doses });
    },
  },
  {
    id: 'labs',
    icon: '🔬',
    title: 'Lab Surge',
    describe: () => 'Testing throughput up by a sixth for the rest of the district.',
    available: inDistrict,
    apply: () => { store.run.labCapacity *= 1.15; },
  },
  {
    id: 'patience',
    icon: '🤝',
    title: 'Public Address',
    describe: () => (store.run
      ? `Compliance from ${Math.round(store.run.compliance * 100)}% up a few points. Closures bite harder next week.`
      : 'A few points of public patience back.'),
    available: () => {
      const s = inDistrict();
      if (!s.ok) return s;
      return store.run.compliance < 0.97 ? { ok: true } : { ok: false, why: 'The public is already with you.' };
    },
    apply: () => { store.run.compliance = clamp(store.run.compliance + 0.06, 0.1, 1); },
  },
];

export const { screens, actions } = createBonusShop({
  store,
  render,
  bonuses: BONUSES,
  storageKey: 'outbreak-bonusshop-v1',
});
