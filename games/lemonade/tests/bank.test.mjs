import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/campaign.js';
import * as B from '../js/bank.js';

function campaignWith(treasury) {
  const campaign = C.newCampaign();
  campaign.treasury = treasury;
  return campaign;
}

test('a fresh campaign starts with an empty bank account', () => {
  const campaign = C.newCampaign();
  assert.deepEqual(campaign.bank, { balance: 0, hasDeposited: false });
});

test('deposit moves cash from the treasury into the bank, never more than you have', () => {
  const campaign = campaignWith(100);
  const result = B.deposit(campaign, 40);
  assert.equal(result.ok, true);
  assert.equal(campaign.treasury, 60);
  assert.equal(campaign.bank.balance, 40);
  assert.equal(campaign.bank.hasDeposited, true);

  const tooMuch = B.deposit(campaign, 1000);
  assert.equal(tooMuch.ok, false);
  assert.equal(campaign.treasury, 60); // unchanged

  assert.equal(B.deposit(campaign, 0).ok, false);
  assert.equal(B.deposit(campaign, -5).ok, false);
});

test('withdraw moves cash back, never more than the bank holds', () => {
  const campaign = campaignWith(0);
  B.deposit(campaign, 0); // no-op, treasury is empty
  campaign.bank.balance = 25;
  const result = B.withdraw(campaign, 10);
  assert.equal(result.ok, true);
  assert.equal(campaign.bank.balance, 15);
  assert.equal(campaign.treasury, 10);

  const tooMuch = B.withdraw(campaign, 1000);
  assert.equal(tooMuch.ok, false);
  assert.equal(campaign.bank.balance, 15); // unchanged
});

test('interest compounds daily and only when there is a balance and days elapsed', () => {
  const campaign = campaignWith(0);
  campaign.bank.balance = 100;
  const earned = B.accrueInterest(campaign, 10);
  const expected = Math.round((100 * Math.pow(1 + B.DAILY_RATE, 10) - 100) * 100) / 100;
  assert.equal(earned, expected);
  assert.equal(campaign.bank.balance, Math.round((100 + expected) * 100) / 100);

  assert.equal(B.accrueInterest(campaign, 0), 0);
  const empty = campaignWith(0);
  assert.equal(B.accrueInterest(empty, 30), 0);
  assert.equal(empty.bank.balance, 0);
});

test('a save from before banking existed gets a bank account lazily', () => {
  const campaign = C.newCampaign();
  delete campaign.bank;
  assert.equal(campaign.bank, undefined);
  const bank = B.ensureBank(campaign);
  assert.deepEqual(bank, { balance: 0, hasDeposited: false });
  assert.equal(campaign.bank, bank);
});

test('an old save with a balance already in it is treated as already-deposited', () => {
  const campaign = C.newCampaign();
  campaign.bank = { balance: 50 }; // pre-hasDeposited shape
  B.ensureBank(campaign);
  assert.equal(campaign.bank.hasDeposited, true);
});
