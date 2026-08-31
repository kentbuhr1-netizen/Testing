import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';

test('same seed replays identically', () => {
  const a = S.newGame(4242);
  const b = S.newGame(4242);
  assert.deepEqual(a.today, b.today);
  assert.deepEqual(S.simulateDay(a), S.simulateDay(b));
});

test('recipe quality peaks at the ideal recipe for the temperature', () => {
  const temp = 88;
  const ice = S.idealIcePerCup(temp);
  const perfect = S.recipeQuality({ lemons: 5, sugar: 5, ice }, temp);
  const watery = S.recipeQuality({ lemons: 1, sugar: 1, ice }, temp);
  const warm = S.recipeQuality({ lemons: 5, sugar: 5, ice: 0 }, temp);
  assert.ok(perfect > 0.95, `expected near-perfect, got ${perfect}`);
  assert.ok(watery < perfect);
  assert.ok(warm < perfect);
});

test('hot days call for more ice than cool ones', () => {
  assert.ok(S.idealIcePerCup(100) > S.idealIcePerCup(65));
  assert.equal(S.idealIcePerCup(55), 0);
});

test('stock is limited by the scarcest ingredient', () => {
  const recipe = { lemons: 5, sugar: 5, ice: 2 };
  assert.equal(S.maxCupsAvailable({ lemons: 10, sugar: 10, ice: 100, cups: 100 }, recipe), 20);
  assert.equal(S.maxCupsAvailable({ lemons: 10, sugar: 5, ice: 100, cups: 100 }, recipe), 10);
  assert.equal(S.maxCupsAvailable({ lemons: 50, sugar: 50, ice: 6, cups: 100 }, recipe), 3);
  assert.equal(S.maxCupsAvailable({ lemons: 50, sugar: 50, ice: 100, cups: 7 }, recipe), 7);
});

test('an ice-free recipe does not need ice in stock', () => {
  const cups = S.maxCupsAvailable({ lemons: 5, sugar: 5, ice: 0, cups: 10 }, { lemons: 5, sugar: 5, ice: 0 });
  assert.equal(cups, 10);
});

test('you can never sell more than you stocked', () => {
  const st = S.newGame(7);
  st.inventory = { lemons: 5, sugar: 5, ice: 20, cups: 10 };
  st.price = 0.05; // give it away — demand will exceed stock
  const r = S.simulateDay(st);
  assert.ok(r.sold <= 10);
  assert.equal(r.sold, r.stock);
  assert.ok(r.lostToStockout > 0);
});

test('a steep price drives customers away', () => {
  const st = S.newGame(99);
  st.inventory = { lemons: 500, sugar: 500, ice: 2000, cups: 1000 };
  st.price = 0.25;
  const cheap = S.simulateDay(st);
  st.price = 5.0;
  const dear = S.simulateDay(st);
  assert.ok(cheap.sold > dear.sold, `${cheap.sold} vs ${dear.sold}`);
  assert.equal(dear.sold, 0);
});

test('committing a day banks revenue, consumes stock and melts the ice', () => {
  const st = S.newGame(2024);
  st.inventory = { lemons: 50, sugar: 50, ice: 200, cups: 100 };
  st.money = 10;
  const r = S.simulateDay(st);
  S.commitDay(st, r);
  assert.equal(st.money, Math.round((10 + r.revenue) * 100) / 100);
  assert.equal(st.inventory.ice, 0);
  assert.equal(st.inventory.cups, 100 - r.used.cups);
  assert.equal(st.inventory.lemons, 50 - r.used.lemons);
  assert.equal(st.day, 2);
  assert.equal(st.history.length, 1);
});

test('ingredients are only spent on pitchers actually poured', () => {
  const st = S.newGame(11);
  st.inventory = { lemons: 100, sugar: 100, ice: 400, cups: 200 };
  st.price = 8.0; // nobody buys
  const r = S.simulateDay(st);
  assert.equal(r.sold, 0);
  assert.equal(r.used.lemons, 0);
  assert.equal(r.used.sugar, 0);
});

test('good lemonade builds reputation, bad lemonade burns it', () => {
  const hot = 95;
  const good = S.newGame(5);
  good.today.temp = hot;
  good.recipe = { lemons: 5, sugar: 5, ice: S.idealIcePerCup(hot) };
  good.price = 0.75;
  good.inventory = { lemons: 200, sugar: 200, ice: 800, cups: 400 };
  assert.ok(S.simulateDay(good).repDelta > 0);

  const bad = S.newGame(5);
  bad.today.temp = hot;
  bad.recipe = { lemons: 1, sugar: 12, ice: 0 };
  bad.price = 2.5;
  bad.inventory = { lemons: 200, sugar: 200, ice: 800, cups: 400 };
  assert.ok(S.simulateDay(bad).repDelta < 0);
});

test('the season runs a fixed number of days', () => {
  const st = S.newGame(1);
  for (let i = 0; i < S.TOTAL_DAYS; i++) {
    st.inventory = { lemons: 100, sugar: 100, ice: 400, cups: 200 };
    st.price = 0.5;
    S.commitDay(st, S.simulateDay(st));
  }
  assert.equal(st.phase, 'gameover');
  assert.equal(st.history.length, S.TOTAL_DAYS);
  assert.equal(S.finalScore(st).cupsSold, st.history.reduce((n, d) => n + d.sold, 0));
});

test('broke with an empty cooler ends the season early', () => {
  const st = S.newGame(3);
  st.money = 0;
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0 };
  S.commitDay(st, S.simulateDay(st));
  assert.equal(st.phase, 'gameover');
  assert.equal(S.finalScore(st).bankrupt, true);
});

test('buy cost adds up the order at the day rate', () => {
  const prices = { lemon: 0.4, sugar: 0.3, ice: 0.05, cup: 0.1 };
  assert.equal(S.buyCost(prices, { lemons: 10, sugar: 10, ice: 100, cups: 50 }), 17);
});

test('a day with nothing to pour reads as closed, not sold out', () => {
  const st = S.newGame(21);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0 };
  const r = S.simulateDay(st);
  assert.equal(r.sold, 0);
  assert.equal(r.stock, 0);
  assert.equal(r.revenue, 0);
  assert.match(r.notes.join(' '), /stayed shut/);
});

test('sitting out a day still advances the calendar', () => {
  const st = S.newGame(22);
  st.money = 12;
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0 };
  S.commitDay(st, S.simulateDay(st));
  assert.equal(st.day, 2);
  assert.equal(st.money, 12);
  assert.equal(st.phase, 'forecast');
});

test('leftover ice melts and the melt is reported', () => {
  const st = S.newGame(31);
  st.inventory = { lemons: 20, sugar: 20, ice: 500, cups: 40 };
  st.price = 9.0; // no sales, so none of the ice gets used
  const r = S.simulateDay(st);
  S.commitDay(st, r);
  assert.equal(r.melted, 500);
  assert.equal(st.inventory.ice, 0);
});

test('ice poured into cups is not counted as melted', () => {
  const st = S.newGame(32);
  st.recipe = { lemons: 5, sugar: 5, ice: 2 };
  st.inventory = { lemons: 100, sugar: 100, ice: 300, cups: 100 };
  st.price = 0.2;
  const r = S.simulateDay(st);
  S.commitDay(st, r);
  assert.ok(r.used.ice > 0);
  assert.equal(r.melted, 300 - r.used.ice);
});

test('the season ends only when even the cheapest pitcher is out of reach', () => {
  const st = S.newGame(41);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0 };
  const p = st.today.prices;
  const cheapest = p.lemon + p.sugar + p.cup;

  st.money = cheapest + 0.5;
  assert.equal(S.isBankrupt(st), false, 'still has a way back in');

  st.money = cheapest - 0.01;
  assert.equal(S.isBankrupt(st), true, 'cannot buy a single thing');

  // Stock on hand always beats an empty wallet.
  st.money = 0;
  st.inventory = { lemons: 5, sugar: 5, ice: 0, cups: 10 };
  st.recipe = { lemons: 5, sugar: 5, ice: 0 };
  assert.equal(S.isBankrupt(st), false);
});
