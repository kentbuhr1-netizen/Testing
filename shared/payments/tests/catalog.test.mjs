import test from 'node:test';
import assert from 'node:assert/strict';
import { PRODUCTS, PRODUCT_INDEX, productsFor, unlocks, formatPrice, FREE_TIER } from '../catalog.js';

test('every product is well formed and priced in whole minor units', () => {
  const ids = new Set();
  for (const p of PRODUCTS) {
    assert.ok(!ids.has(p.id), `duplicate product id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name && p.blurb, p.id);
    assert.ok(Number.isInteger(p.amount) && p.amount > 0, `${p.id} price ${p.amount}`);
    assert.match(p.currency, /^[a-z]{3}$/, p.id);
    assert.ok(Array.isArray(p.unlocks) && p.unlocks.length > 0, p.id);
  }
});

test('a game unlock covers that game and nothing else', () => {
  assert.equal(unlocks(['outbreak.full'], 'outbreak'), true);
  assert.equal(unlocks(['outbreak.full'], 'lemonade'), false);
  assert.equal(unlocks(['lemonade.full'], 'outbreak'), false);
});

test('the bundle covers games that did not exist when it was bought', () => {
  assert.equal(unlocks(['bundle.all'], 'outbreak'), true);
  assert.equal(unlocks(['bundle.all'], 'lemonade'), true);
  // Next week's game, which the catalog has never heard of.
  assert.equal(unlocks(['bundle.all'], 'some-future-game'), true);
  assert.equal(unlocks(['outbreak.full'], 'some-future-game'), false);
});

test('owning nothing, or a retired product id, unlocks nothing', () => {
  assert.equal(unlocks([], 'outbreak'), false);
  assert.equal(unlocks(undefined, 'outbreak'), false);
  assert.equal(unlocks(['outbreak.season-pass-2019'], 'outbreak'), false);
});

test('the shop offers a game its own unlock and the bundle, cheapest first', () => {
  const offers = productsFor('outbreak');
  assert.ok(offers.length >= 2);
  assert.ok(offers.every((p) => p.unlocks.includes('outbreak') || p.unlocks.includes('*')));
  for (let i = 1; i < offers.length; i++) {
    assert.ok(offers[i].amount >= offers[i - 1].amount, 'not sorted by price');
  }
  assert.ok(offers.some((p) => p.id === 'bundle.all'));
});

test('the bundle is worth buying over two singles', () => {
  const bundle = PRODUCT_INDEX['bundle.all'];
  const singles = PRODUCTS.filter((p) => p.game).reduce((n, p) => n + p.amount, 0);
  assert.ok(bundle.amount < singles, 'a bundle nobody saves money on is not a bundle');
});

test('prices render as money', () => {
  assert.equal(formatPrice({ amount: 499, currency: 'usd' }), '$4.99');
  assert.equal(formatPrice({ amount: 1199, currency: 'gbp' }), '£11.99');
  assert.equal(formatPrice({ amount: 500, currency: 'sek' }), '5.00 SEK');
});

test('every game with a free tier has something to sell, and vice versa', () => {
  for (const game of Object.keys(FREE_TIER)) {
    assert.ok(productsFor(game).length > 0, `${game} is gated but unbuyable`);
  }
  for (const p of PRODUCTS) {
    if (p.game) assert.ok(FREE_TIER[p.game], `${p.game} is for sale but has no free tier`);
  }
});
