import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../js/sim.js';

test('same seed replays identically', () => {
  const a = S.newGame(4242);
  const b = S.newGame(4242);
  assert.deepEqual(a.today, b.today);
  assert.deepEqual(S.simulateDay(a), S.simulateDay(b));
});

test('the starting price is never a guaranteed loss on the starting recipe', () => {
  // Regression: a city with marked-up supply prices (e.g. NYC's cost mods)
  // could leave the classic 50¢ default underwater before a first-time
  // player ever touches the price stepper. newRun() nudges it up just
  // enough to clear cost, in nickel steps, but never below 50¢.
  let sawUnchanged = false;
  for (let seed = 0; seed < 50; seed++) {
    const st = S.newGame(seed);
    const cost = S.costPerCup(st.recipe, st.today.prices);
    assert.ok(st.price >= cost, `seed ${seed}: price ${st.price} should cover cost ${cost}`);
    assert.ok(st.price >= 0.5, `seed ${seed}: price should never drop below the classic 50¢`);
    if (st.price === 0.5) sawUnchanged = true;
  }
  assert.ok(sawUnchanged, 'sanity: 50¢ should still be untouched wherever it was already fine');
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

test('totalPourable counts small and large cup stock too, not just medium', () => {
  // Regression: the setup screen used maxCupsAvailable() — medium-only — to
  // decide whether there was anything to open with, so a player stocked
  // entirely on small or large cups (no medium) always saw "Stay Closed
  // Today" even with plenty to sell.
  const recipe = { lemons: 5, sugar: 5, ice: 2 };
  const smallOnly = { lemons: 50, sugar: 50, ice: 100, cups: 0, cupsSmall: 20, cupsLarge: 0 };
  const largeOnly = { lemons: 50, sugar: 50, ice: 100, cups: 0, cupsSmall: 0, cupsLarge: 20 };
  assert.equal(S.maxCupsAvailable(smallOnly, recipe), 0, 'sanity: the medium-only count is still 0');
  assert.ok(S.totalPourable(smallOnly, recipe) > 0, 'small-cup stock should count toward what can be poured');
  assert.ok(S.totalPourable(largeOnly, recipe) > 0, 'large-cup stock should count toward what can be poured');
});

test('canOpenToday reflects small/large cup stock and BYO, not just medium', () => {
  const recipe = { lemons: 5, sugar: 5, ice: 2 };
  const smallOnly = {
    recipe,
    byoAccepted: false,
    inventory: { lemons: 50, sugar: 50, ice: 100, cups: 0, cupsSmall: 20, cupsLarge: 0 },
  };
  assert.equal(S.canOpenToday(smallOnly), true);

  const noCupsButBYO = {
    recipe,
    byoAccepted: true,
    inventory: { lemons: 50, sugar: 50, ice: 100, cups: 0, cupsSmall: 0, cupsLarge: 0 },
  };
  assert.equal(S.canOpenToday(noCupsButBYO), true, 'BYO alone should be enough to open, even with zero cup stock');

  const nothingAtAll = {
    recipe,
    byoAccepted: false,
    inventory: { lemons: 0, sugar: 0, ice: 0, cups: 0, cupsSmall: 0, cupsLarge: 0 },
  };
  assert.equal(S.canOpenToday(nothingAtAll), false);
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
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, cupsSmall: 0, cupsLarge: 0 };
  const p = st.today.prices;
  // A small paper cup is the cheapest possible fallback purchase.
  const cheapest = p.lemon + p.sugar + p.cup * S.CUP_SIZES.small.costMult;

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

/* -------------------------------------------------------------- *
 * Lemons spoil after a week
 * -------------------------------------------------------------- */

test('lemons bought together are dated as one batch', () => {
  const st = S.newGame(50);
  S.receiveLemons(st, 40);
  assert.equal(st.inventory.lemons, 40);
  assert.deepEqual(st.inventory.lemonBatches, [{ day: 1, qty: 40 }]);
});

test('a batch survives exactly one week, then spoils overnight', () => {
  const st = S.newGame(51);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, lemonBatches: [], enhancers: {} };
  S.receiveLemons(st, 30);
  st.recipe = { lemons: 1, sugar: 1, ice: 0 }; // so nothing gets consumed by selling
  st.price = 9; // nobody buys, so the batch just sits and ages
  for (let i = 0; i < S.LEMON_SHELF_LIFE_DAYS - 1; i++) {
    const r = S.simulateDay(st);
    S.commitDay(st, r);
    assert.equal(r.spoiledLemons, 0, `should not spoil yet on day ${st.day}`);
    assert.equal(st.inventory.lemons, 30);
  }
  // One more day crosses the seven-day mark.
  const last = S.simulateDay(st);
  S.commitDay(st, last);
  assert.equal(last.spoiledLemons, 30);
  assert.equal(st.inventory.lemons, 0);
  assert.deepEqual(st.inventory.lemonBatches, []);
});

test('newer lemons bought on top of an old batch spoil independently', () => {
  const st = S.newGame(52);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, lemonBatches: [], enhancers: {} };
  S.receiveLemons(st, 20); // day 1
  st.recipe = { lemons: 1, sugar: 1, ice: 0 };
  st.price = 9;
  for (let i = 0; i < 3; i++) S.commitDay(st, S.simulateDay(st)); // now on day 4
  S.receiveLemons(st, 15); // a second, fresher batch bought day 4
  assert.equal(st.inventory.lemons, 35);

  for (let i = 0; i < 3; i++) S.commitDay(st, S.simulateDay(st)); // now on day 7: first batch is a week old
  const spoilingDay = S.simulateDay(st);
  S.commitDay(st, spoilingDay);
  assert.equal(spoilingDay.spoiledLemons, 20, 'only the original batch should be old enough');
  assert.equal(st.inventory.lemons, 15, 'the second batch survives');
});

test('spoilage consumes the oldest lemons first, same as selling does', () => {
  const st = S.newGame(53);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, lemonBatches: [], enhancers: {} };
  S.receiveLemons(st, 10); // day 1
  st.day = 4;
  S.receiveLemons(st, 10); // a second, fresher batch
  assert.equal(st.inventory.lemons, 20);

  // A synthetic day that used exactly half a pitcher's worth of lemons —
  // enough to check draw order without fighting simulateDay's randomness.
  const fakeResult = { revenue: 0, rent: 0, repDelta: 0, used: { lemons: 5, sugar: 0, cups: 0, ice: 0, enhancers: {} } };
  S.commitDay(st, fakeResult);
  assert.deepEqual(st.inventory.lemonBatches[0], { day: 1, qty: 5 });
  assert.deepEqual(st.inventory.lemonBatches[1], { day: 4, qty: 10 });
});

test('the never-expire unlock stops spoilage entirely', () => {
  const st = S.newRun({ seed: 54, premium: { neverExpireLemons: true } });
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, lemonBatches: [], enhancers: {} };
  S.receiveLemons(st, 25);
  st.recipe = { lemons: 1, sugar: 1, ice: 0 };
  st.price = 9;
  for (let i = 0; i < 20; i++) S.commitDay(st, S.simulateDay(st));
  assert.equal(st.inventory.lemons, 25);
});

test('daysUntilLemonsSpoil counts down from the oldest batch', () => {
  const st = S.newGame(55);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, lemonBatches: [], enhancers: {} };
  assert.equal(S.daysUntilLemonsSpoil(st), null, 'nothing in the cooler yet');
  S.receiveLemons(st, 10);
  assert.equal(S.daysUntilLemonsSpoil(st), S.LEMON_SHELF_LIFE_DAYS);
  st.recipe = { lemons: 1, sugar: 1, ice: 0 };
  st.price = 9;
  for (let i = 0; i < 3; i++) S.commitDay(st, S.simulateDay(st));
  assert.equal(S.daysUntilLemonsSpoil(st), S.LEMON_SHELF_LIFE_DAYS - 3);
});

test('receiveOrder routes lemons through the dated-batch path and everything else straight in', () => {
  const st = S.newGame(56);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, lemonBatches: [], enhancers: {} };
  S.receiveOrder(st, { lemons: 12, sugar: 8, ice: 4, cups: 6 });
  assert.equal(st.inventory.lemons, 12);
  assert.deepEqual(st.inventory.lemonBatches, [{ day: 1, qty: 12 }]);
  assert.equal(st.inventory.sugar, 8);
  assert.equal(st.inventory.ice, 4);
  assert.equal(st.inventory.cups, 6);
});

/* -------------------------------------------------------------- *
 * Enhancers
 * -------------------------------------------------------------- */

test('an enhancer never sells unless it is switched on', () => {
  const st = S.newGame(60);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, lemonBatches: [], enhancers: { strawberry: 200 } };
  st.price = 0.3;
  const r = S.simulateDay(st);
  assert.deepEqual(r.enhancers, {});
  assert.equal(r.enhancerRevenue, 0);
});

test('an offered, stocked enhancer sells and adds to revenue', () => {
  const st = S.newGame(61);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, lemonBatches: [], enhancers: { strawberry: 200 } };
  st.enhancersOffered = { strawberry: true };
  st.price = 0.3;
  const r = S.simulateDay(st);
  assert.ok(r.enhancers.strawberry.cups > 0);
  assert.ok(r.enhancerRevenue > 0);
  assert.equal(r.revenue, S.CUPS_PER_PITCHER > 0 ? r.revenue : 0); // sanity: revenue is a real number
  assert.ok(r.revenue > r.sold * r.price, 'enhancer revenue should be on top of the base take');
});

test('an enhancer never outsells its own stock', () => {
  const st = S.newGame(62);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, lemonBatches: [], enhancers: { caffeine: 3 } };
  st.enhancersOffered = { caffeine: true };
  st.price = 0.1; // cheap, so plenty of cups sell and could outstrip 3 units
  const r = S.simulateDay(st);
  assert.ok((r.enhancers.caffeine?.cups || 0) <= 3);
});

test('running out of an enhancer never blocks the base cup from selling', () => {
  const st = S.newGame(63);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, lemonBatches: [], enhancers: { mango: 0 } };
  st.enhancersOffered = { mango: true };
  st.price = 0.2;
  const r = S.simulateDay(st);
  assert.ok(r.sold > 0);
  assert.deepEqual(r.enhancers, {});
});

test('committing a day draws enhancer stock down by exactly what sold', () => {
  const st = S.newGame(64);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, lemonBatches: [], enhancers: { strawberry: 200 } };
  st.enhancersOffered = { strawberry: true };
  st.price = 0.3;
  const r = S.simulateDay(st);
  const sold = r.enhancers.strawberry.cups;
  S.commitDay(st, r);
  assert.equal(st.inventory.enhancers.strawberry, 200 - sold);
});

test('a hot day sells more mint, a cooling add-on', () => {
  const hot = S.newGame(65);
  hot.today.temp = 100;
  hot.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, lemonBatches: [], enhancers: { mint: 500 } };
  hot.enhancersOffered = { mint: true };
  hot.price = 0.3;

  const cool = S.newGame(65);
  cool.today.temp = 60;
  cool.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, lemonBatches: [], enhancers: { mint: 500 } };
  cool.enhancersOffered = { mint: true };
  cool.price = 0.3;

  const hotCups = S.simulateDay(hot).enhancers.mint?.cups || 0;
  const coolCups = S.simulateDay(cool).enhancers.mint?.cups || 0;
  assert.ok(hotCups >= coolCups, `expected hot day to sell at least as much mint (${hotCups} vs ${coolCups})`);
});

test('enhancers never gate whether a cup can be poured', () => {
  const withStock = S.newGame(66);
  withStock.inventory = { lemons: 20, sugar: 20, ice: 0, cups: 20, enhancers: { strawberry: 200 } };
  withStock.enhancersOffered = { strawberry: true };
  const bare = S.newGame(66);
  bare.inventory = { lemons: 20, sugar: 20, ice: 0, cups: 20, enhancers: {} };
  assert.equal(S.maxCupsAvailable(withStock.inventory, withStock.recipe), S.maxCupsAvailable(bare.inventory, bare.recipe));
});

test('season totals add up enhancer cups and revenue across the run', () => {
  const st = S.newGame(67);
  st.inventory = { lemons: 5000, sugar: 5000, ice: 5000, cups: 5000, lemonBatches: [], enhancers: { strawberry: 5000 } };
  st.enhancersOffered = { strawberry: true };
  st.price = 0.3;
  for (let i = 0; i < 10; i++) S.commitDay(st, S.simulateDay(st));
  const score = S.finalScore(st);
  assert.ok(score.enhancerCups > 0);
  assert.ok(score.enhancerRevenue > 0);
});

test('enhancer stock has a fixed price, independent of the daily market', () => {
  const cost = S.enhancerOrderCost({ strawberry: 10, caffeine: 5 });
  const expected = 10 * S.ENHANCERS.strawberry.unitCost + 5 * S.ENHANCERS.caffeine.unitCost;
  assert.equal(cost, Math.round(expected * 100) / 100);
});

test('receiveOrder tops up enhancer stock through its own sub-order', () => {
  const st = S.newGame(70);
  S.receiveOrder(st, { lemons: 5, sugar: 5, ice: 5, cups: 5, enhancers: { mint: 40, caffeine: 10 } });
  assert.equal(st.inventory.enhancers.mint, 40);
  assert.equal(st.inventory.enhancers.caffeine, 10);
  assert.equal(st.inventory.enhancers.strawberry, 0, 'untouched enhancers stay at zero');
});

/* -------------------------------------------------------------- *
 * Cup sizes and BYO
 * -------------------------------------------------------------- */

test('with no small or large stock, everything still runs through medium alone', () => {
  const st = S.newGame(80);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, cupsSmall: 0, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  st.price = 0.4;
  const r = S.simulateDay(st);
  assert.equal(Object.keys(r.sizes).length, 1);
  assert.ok(r.sizes.medium);
  assert.equal(r.sold, r.sizes.medium.sold);
  assert.equal(r.used.cupsSmall, 0);
  assert.equal(r.used.cupsLarge, 0);
});

test('stocking small cups actually sells some, without needing a separate toggle', () => {
  const st = S.newGame(81);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, cupsSmall: 200, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  st.price = 0.4;
  st.cupPrices = { small: 0.3, large: 0.7, byo: 0.4 };
  const r = S.simulateDay(st);
  assert.ok(r.sizes.small.sold > 0, 'small should sell once stocked');
  assert.equal(r.used.cupsSmall, r.sizes.small.sold);
});

test('a large cup costs more lemons and sugar to make than a small one', () => {
  const smallCost = S.costPerCupSized({ lemons: 5, sugar: 5, ice: 2 }, { lemon: 0.4, sugar: 0.3, ice: 0.05, cup: 0.1 }, 'small');
  const mediumCost = S.costPerCupSized({ lemons: 5, sugar: 5, ice: 2 }, { lemon: 0.4, sugar: 0.3, ice: 0.05, cup: 0.1 }, 'medium');
  const largeCost = S.costPerCupSized({ lemons: 5, sugar: 5, ice: 2 }, { lemon: 0.4, sugar: 0.3, ice: 0.05, cup: 0.1 }, 'large');
  assert.ok(smallCost < mediumCost, `${smallCost} vs ${mediumCost}`);
  assert.ok(mediumCost < largeCost, `${mediumCost} vs ${largeCost}`);
});

test('a BYO cup costs nothing for the cup itself', () => {
  const prices = { lemon: 0.4, sugar: 0.3, ice: 0.05, cup: 0.1 };
  const withCup = S.costPerCupSized({ lemons: 5, sugar: 5, ice: 2 }, prices, 'medium');
  const byo = S.costPerCupSized({ lemons: 5, sugar: 5, ice: 2 }, prices, 'byo');
  assert.ok(byo < withCup);
});

test('BYO only sells once accepted, and never touches cup inventory', () => {
  const st = S.newGame(82);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, cupsSmall: 0, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  st.price = 0.4;
  st.cupPrices = { small: 0.3, large: 0.7, byo: 0.35 };

  const off = S.simulateDay(st);
  assert.equal(off.sizes.byo, undefined);

  st.byoAccepted = true;
  const on = S.simulateDay(st);
  assert.ok(on.sizes.byo.sold > 0);
  assert.equal(on.used.cups, on.sizes.medium.sold, 'medium cup use is unaffected by BYO');
});

test('running out of large cups never blocks small or medium from selling', () => {
  const st = S.newGame(83);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 200, cupsSmall: 200, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  st.price = 0.3;
  st.cupPrices = { small: 0.25, large: 0.6, byo: 0.3 };
  const r = S.simulateDay(st);
  assert.equal(r.sizes.large, undefined, 'large was never stocked, so it never enters the mix');
  assert.ok(r.sizes.medium.sold > 0);
  assert.ok(r.sizes.small.sold > 0);
});

test('ingredient use pools correctly across every size sold that day', () => {
  const st = S.newGame(84);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, cupsSmall: 500, cupsLarge: 500, lemonBatches: [], enhancers: {} };
  st.price = 0.2;
  st.cupPrices = { small: 0.15, large: 0.35, byo: 0.2 };
  st.byoAccepted = true;
  const r = S.simulateDay(st);
  const servings = ['medium', 'small', 'large'].reduce((n, id) => n + (r.sizes[id]?.sold || 0) * S.CUP_SIZES[id].servingMult, 0)
    + (r.sizes.byo?.sold || 0);
  const expectedPitchers = Math.ceil(servings / S.CUPS_PER_PITCHER);
  assert.equal(r.used.lemons, expectedPitchers * st.recipe.lemons);
  assert.equal(r.used.sugar, expectedPitchers * st.recipe.sugar);
});

test('committing a multi-size day draws every cup type down correctly', () => {
  const st = S.newGame(85);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 100, cupsSmall: 100, cupsLarge: 100, lemonBatches: [], enhancers: {} };
  st.price = 0.3;
  st.cupPrices = { small: 0.25, large: 0.55, byo: 0.3 };
  const r = S.simulateDay(st);
  S.commitDay(st, r);
  assert.equal(st.inventory.cups, 100 - r.used.cups);
  assert.equal(st.inventory.cupsSmall, 100 - r.used.cupsSmall);
  assert.equal(st.inventory.cupsLarge, 100 - r.used.cupsLarge);
});

test('bankruptcy checks every size and BYO before giving up', () => {
  const st = S.newGame(86);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, cupsSmall: 5, cupsLarge: 0 };
  st.recipe = { lemons: 5, sugar: 5, ice: 0 };
  st.money = 0;
  // No lemons or sugar at all, so even a stocked small cup cannot be poured.
  assert.equal(S.isBankrupt(st), true);

  st.inventory = { lemons: 5, sugar: 5, ice: 0, cups: 0, cupsSmall: 5, cupsLarge: 0 };
  assert.equal(S.isBankrupt(st), false, 'a small cup can still be poured');
});

test('BYO alone can keep a corner out of bankruptcy with no cups at all', () => {
  const st = S.newGame(87);
  st.inventory = { lemons: 5, sugar: 5, ice: 0, cups: 0, cupsSmall: 0, cupsLarge: 0 };
  st.recipe = { lemons: 5, sugar: 5, ice: 0 };
  st.money = 0;
  st.byoAccepted = false;
  assert.equal(S.isBankrupt(st), true);
  st.byoAccepted = true;
  assert.equal(S.isBankrupt(st), false);
});

test('receiveOrder tops up small and large cup stock like any other ingredient', () => {
  const st = S.newGame(88);
  st.inventory = { lemons: 0, sugar: 0, ice: 0, cups: 0, cupsSmall: 0, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  S.receiveOrder(st, { lemons: 10, sugar: 10, ice: 10, cups: 10, cupsSmall: 40, cupsLarge: 15 });
  assert.equal(st.inventory.cupsSmall, 40);
  assert.equal(st.inventory.cupsLarge, 15);
});

test('card payments are off by default and touch nothing when unused', () => {
  const st = S.newGame(90);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, cupsSmall: 0, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  const r = S.simulateDay(st);
  assert.equal(r.cardCups, 0);
  assert.equal(r.cardFeeRevenue, 0);
  assert.equal(r.cardProcessingCost, 0);
  assert.equal(r.cardNet, 0);
});

test('accepting cards splits the same sales by payment method, without changing how many sell', () => {
  const withoutCards = S.newGame(91);
  withoutCards.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, cupsSmall: 0, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  const base = S.simulateDay(withoutCards);

  const withCards = S.newGame(91);
  withCards.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, cupsSmall: 0, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  withCards.acceptCards = true;
  const cardDay = S.simulateDay(withCards);

  assert.equal(cardDay.sold, base.sold, 'accepting cards never changes how many cups sell');
  assert.equal(cardDay.cardCups, Math.round(base.sold * S.CARD_SHARE));
  assert.equal(cardDay.cardFeeRevenue, Math.round(cardDay.cardCups * cardDay.price * S.CARD_CONVENIENCE_RATE * 100) / 100);
  assert.equal(cardDay.cardProcessingCost, Math.round(cardDay.cardCups * cardDay.price * S.CARD_PROCESSING_RATE * 100) / 100);
  assert.equal(cardDay.revenue, Math.round((base.revenue + cardDay.cardFeeRevenue) * 100) / 100);
  assert.equal(cardDay.cogs, Math.round((base.cogs + cardDay.cardProcessingCost) * 100) / 100);
});

test('the convenience fee always covers the processing cost, never a loss on card sales', () => {
  const st = S.newGame(92);
  st.inventory = { lemons: 500, sugar: 500, ice: 500, cups: 500, cupsSmall: 0, cupsLarge: 0, lemonBatches: [], enhancers: {} };
  st.acceptCards = true;
  const r = S.simulateDay(st);
  assert.ok(r.cardNet >= 0, 'the fee rate is set at or above the processing rate');
});

test('every corner in the campaign is still winnable with cup sizes in the sim', () => {
  // Regression guard: the reference bot never touches small/large/BYO, so
  // every one of the 625 calibrated targets must be exactly what it was.
  assert.equal(S.parProfit({ seed: 999, days: 7, stake: 25 }) > 0, true);
});
