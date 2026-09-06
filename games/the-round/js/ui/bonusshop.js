/**
 * The Round's bonus list.
 *
 * The shop itself — the ad gate, the cooldowns, the screen and the
 * disclaimer — is the shared shell in js/bonusshop/, identical in every game
 * in the series. All that belongs here is what a small boost means to a
 * grass-cutting round, and when it is worth offering.
 *
 * Nothing here adds daylight or shortens a drive: the route is the game, and
 * a bonus that solved it would replace it. These are top-ups at the edges —
 * a sharper blade, a kinder word, a few pounds in the tin.
 */
import { store, render } from '../store.js';
import { createBonusShop } from '../bonusshop/shell.js';
import { money } from './kit.js';

const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

const midRound = () => (store.run && store.run.phase !== 'gameover'
  ? { ok: true }
  : { ok: false, why: 'Only useful mid-round — start one first.' });

const BONUSES = [
  {
    id: 'tin',
    icon: '💷',
    title: 'A Tip in the Tin',
    describe: () => `+${money(12)} from a client who liked the edges.`,
    available: midRound,
    apply: () => { store.run.money = round2(store.run.money + 12); },
  },
  {
    id: 'sharpen',
    icon: '🔪',
    title: 'Free Sharpen',
    describe: () => (store.run
      ? `Blade from ${Math.round(store.run.sharpness * 100)}% to fresh, without the ${money(6)} or the morning.`
      : 'A fresh edge on the blade, for nothing.'),
    available: () => {
      const s = midRound();
      if (!s.ok) return s;
      return store.run.sharpness < 0.98 ? { ok: true } : { ok: false, why: 'The blade is already fresh.' };
    },
    apply: () => { store.run.sharpness = 1; },
  },
  {
    id: 'edge',
    icon: '✨',
    title: 'Touch-Up',
    describe: () => 'A quarter of the blade’s edge back — enough to finish the day without the dull creeping in.',
    available: () => {
      const s = midRound();
      if (!s.ok) return s;
      return store.run.sharpness < 0.75 ? { ok: true } : { ok: false, why: 'The blade is not dull enough to need it.' };
    },
    apply: () => { store.run.sharpness = clamp(store.run.sharpness + 0.25, 0.15, 1); },
  },
  {
    id: 'word',
    icon: '🗣️',
    title: 'Word of Mouth',
    describe: () => (store.run
      ? `The round’s opinion of you from ${Math.round(store.run.standing * 100)}% up a few points.`
      : 'A few points of standing back.'),
    available: () => {
      const s = midRound();
      if (!s.ok) return s;
      return store.run.standing < 0.98 ? { ok: true } : { ok: false, why: 'The round already thinks the world of you.' };
    },
    apply: () => { store.run.standing = clamp(store.run.standing + 0.05, 0.55, 1); },
  },
  {
    id: 'float',
    icon: '🏦',
    title: 'Yard Float',
    describe: () => `+${money(20)} into the firm’s treasury.`,
    available: () => (store.campaign ? { ok: true } : { ok: false, why: 'Start a campaign first — a free season has no firm.' }),
    apply: () => { store.campaign.treasury = round2(store.campaign.treasury + 20); },
  },
];

export const { screens, actions } = createBonusShop({
  store,
  render,
  bonuses: BONUSES,
  storageKey: 'the-round-bonusshop-v1',
});
