/** The bank: park treasury cash to earn interest while you're out playing. */
import * as B from '../bank.js';
import { store, checkAchievements, achievementToast } from '../store.js';
import { money, whole, fact, row, stepper, backBar } from './kit.js';

function bankScreen() {
  const campaign = store.campaign;
  B.ensureBank(campaign);
  const amount = store.ui.bankAmount;
  const balance = campaign.bank.balance;
  const dailyEarnings = Math.round(balance * B.DAILY_RATE * 100) / 100;

  return {
    body: `
      ${backBar('The Map', 'to-world')}
      <h1>🏦 The Bank</h1>
      <div class="card">
        <div class="facts">
          ${fact('In the bank', money(balance), 'good')}
          ${fact('Treasury cash', money(campaign.treasury))}
          ${fact('Combined', whole(balance + campaign.treasury))}
          ${fact('Interest rate', `${(B.DAILY_RATE * 100).toFixed(1)}%/day`)}
        </div>
        ${balance > 0 ? `<p class="muted" style="margin-top:8px">At this balance, that's roughly ${money(dailyEarnings)} a day —
           it compounds for every day you spend working a corner, campaign or free play.</p>` : ''}
      </div>
      <div class="card">
        <h2>Move money</h2>
        ${row('Amount', null, stepper('bankAmount', 'amount', amount, 10, 0, 999999, money(amount)))}
        <div class="chip-row" style="margin-top:10px">
          <button class="chip" data-act="bank-preset" data-frac="0.25">25%</button>
          <button class="chip" data-act="bank-preset" data-frac="0.5">50%</button>
          <button class="chip" data-act="bank-preset" data-frac="1">All</button>
          <button class="chip" data-act="bank-clear-amount">Clear</button>
        </div>
        <p class="muted" style="margin-top:10px">Deposits and withdrawals are instant and free — the only cost of pulling
          cash out is the interest it stops earning.</p>
      </div>`,
    actions: `
      <button class="btn" data-act="bank-deposit" ${amount <= 0 || amount > campaign.treasury ? 'disabled' : ''}>
        Deposit ${money(amount)}
      </button>
      <button class="btn-ghost" data-act="bank-withdraw" ${amount <= 0 || amount > balance ? 'disabled' : ''}>
        Withdraw ${money(amount)}
      </button>`,
  };
}

export const screens = { bank: bankScreen };

export const actions = {
  'open-bank': () => { store.ui.bankAmount = 0; store.ui.view = 'bank'; },
  'bank-preset': (el) => {
    const frac = Number(el.dataset.frac);
    const campaign = store.campaign;
    B.ensureBank(campaign);
    // A preset means "of whichever pile has more to move" — cash to deposit,
    // or bank balance to pull back out — so the buttons stay useful either way.
    const base = campaign.treasury >= campaign.bank.balance ? campaign.treasury : campaign.bank.balance;
    store.ui.bankAmount = Math.round(base * frac * 100) / 100;
  },
  'bank-clear-amount': () => { store.ui.bankAmount = 0; },
  'bank-deposit': () => {
    const result = B.deposit(store.campaign, store.ui.bankAmount);
    if (!result.ok) { store.ui.notice = result.why; return; }
    store.ui.bankAmount = 0;
    store.ui.notice = achievementToast(checkAchievements());
  },
  'bank-withdraw': () => {
    const result = B.withdraw(store.campaign, store.ui.bankAmount);
    if (result.ok) store.ui.bankAmount = 0;
    else store.ui.notice = result.why;
  },
};
