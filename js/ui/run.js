/** The day loop: forecast, supplies, the stand, opening up, and the report. */
import * as S from '../sim.js';
import * as C from '../campaign.js';
import * as B from '../bank.js';
import * as Emp from '../employees.js';
import { tickOps, newOps } from '../ops.js';
import { store, render, recordBest, isPremiumUnlocked, recordDay, recordTierWon, recordInterest, checkAchievements, achievementToast } from '../store.js';
import { money, whole, cents, fact, stepper, row, tierPill } from './kit.js';

const zeroedEnhancers = () => Object.fromEntries(Object.keys(S.ENHANCERS).map((id) => [id, 0]));

const run = () => store.run;

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

function forecastScreen() {
  const r = run();
  const w = S.WEATHER[r.today.weather];
  const yesterday = r.history[r.history.length - 1];
  return {
    body: `
      <h1>Day ${r.day} <span class="of">of ${r.days}</span></h1>
      <div class="card">
        <div class="weather">
          <div class="weather-icon">${w.icon}</div>
          <div class="weather-main">
            <div class="weather-temp">${r.today.temp}°F</div>
            <div class="weather-label">${w.label}</div>
          </div>
        </div>
        ${r.today.event ? `<div class="headline">📣 ${r.today.event.text}</div>` : ''}
      </div>
      <div class="card">
        <h2>In the cooler</h2>
        <div class="facts">
          ${fact('Lemons', r.inventory.lemons)}
          ${fact('Sugar', r.inventory.sugar)}
          ${fact('Ice', `${r.inventory.ice} 🧊`)}
          ${fact('Small cups', r.inventory.cupsSmall)}
          ${fact('Medium cups', r.inventory.cups)}
          ${fact('Large cups', r.inventory.cupsLarge)}
        </div>
        ${lemonFreshnessNote(r)}
        ${yesterday?.melted > 0
          ? `<p class="muted" style="margin-top:6px">${yesterday.melted} ice cube${yesterday.melted === 1 ? '' : 's'} melted overnight.</p>`
          : ''}
        ${yesterday?.spoiledLemons > 0
          ? `<p class="warn" style="margin-top:6px">${yesterday.spoiledLemons} lemon${yesterday.spoiledLemons === 1 ? '' : 's'} went bad overnight — a week in the cooler is all they get.</p>`
          : ''}
      </div>
      ${yesterday ? `<p class="muted center">Yesterday you sold ${yesterday.sold} cup${yesterday.sold === 1 ? '' : 's'} for ${money(yesterday.revenue)}.</p>` : ''}`,
    actions: `
      <button class="btn" data-act="to-buy">Go Shopping</button>
      <button class="btn-ghost" data-act="quit-run">${r.corner ? 'Give Up On This Corner' : 'Menu'}</button>`,
  };
}

/** A quiet reminder near the lemons that the clock is running, unless it isn't. */
function lemonFreshnessNote(r) {
  if (r.premium?.neverExpireLemons) {
    return r.inventory.lemons > 0
      ? '<p class="muted good" style="margin-top:6px">✓ Never-expiring lemons — nothing in this cooler goes bad.</p>'
      : '';
  }
  const daysLeft = S.daysUntilLemonsSpoil(r);
  if (daysLeft == null) return '';
  if (daysLeft <= 3) {
    return `<p class="warn" style="margin-top:6px">Your oldest lemons spoil in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.
      <button class="link-btn" data-act="open-premium">Never let that happen →</button></p>`;
  }
  return `<p class="muted" style="margin-top:6px">Oldest lemons are good for ${daysLeft} more day${daysLeft === 1 ? '' : 's'}.</p>`;
}

function buyScreen() {
  const r = run();
  const p = r.today.prices;
  const o = store.ui.order;
  const baseCost = S.buyCost(p, o);
  const enhCost = S.enhancerOrderCost(o.enhancers);
  const sizedCupCost = S.sizedCupOrderCost(p, o);
  const cost = Math.round((baseCost + sizedCupCost + enhCost) * 100) / 100;
  const left = r.money - cost;
  const after = {
    lemons: r.inventory.lemons + o.lemons,
    sugar: r.inventory.sugar + o.sugar,
    ice: r.inventory.ice + o.ice,
    cups: r.inventory.cups + o.cups,
    cupsSmall: r.inventory.cupsSmall + o.cupsSmall,
    cupsLarge: r.inventory.cupsLarge + o.cupsLarge,
  };
  const pourable = S.maxCupsAvailable(after, r.recipe);
  const line = (key, name, unit, step) =>
    row(name, `${cents(p[unit])} each · cooler: ${after[key]}`,
        stepper('order', key, o[key], step, 0, 9999));

  const lemonSub = r.premium?.neverExpireLemons
    ? `${cents(p.lemon)} each · cooler: ${after.lemons} · never expires`
    : `${cents(p.lemon)} each · cooler: ${after.lemons} · good for ${S.LEMON_SHELF_LIFE_DAYS} days`;

  const sizeCupLine = (sizeId, field, step) => {
    const size = S.CUP_SIZES[sizeId];
    const unitCost = p.cup * size.costMult;
    return row(`${size.icon} ${size.label} · ${size.material}`, `${cents(unitCost)} each · cooler: ${after[field]}`,
      stepper('order', field, o[field], step, 0, 9999));
  };

  const enhancerRows = Object.values(S.ENHANCERS).map((enh) => {
    const held = r.inventory.enhancers?.[enh.id] || 0;
    return row(`${enh.icon} ${enh.label}`, `${cents(enh.unitCost)} each to stock · adds ${money(enh.addPrice)} to the cup · cooler: ${held + (o.enhancers[enh.id] || 0)}`,
      stepper('enhancerOrder', enh.id, o.enhancers[enh.id] || 0, 10, 0, 999));
  }).join('');

  return {
    body: `
      <h1>Supplies</h1>
      <p class="muted">Prices move a little every day. Buy for the weather you are expecting.</p>
      <div class="card">
        ${row('Lemons 🍋', lemonSub, stepper('order', 'lemons', o.lemons, 5, 0, 9999))}
        ${line('sugar', 'Sugar 🥄', 'sugar', 5)}
        ${line('ice', 'Ice cubes 🧊', 'ice', 25)}
        ${sizeCupLine('small', 'cupsSmall', 10)}
        ${sizeCupLine('medium', 'cups', 10)}
        ${sizeCupLine('large', 'cupsLarge', 10)}
        <div class="total">
          <span>Total</span>
          <span class="${cost > r.money ? 'over' : ''}">${money(cost)}</span>
        </div>
        <div class="total subtotal">
          <span class="muted">Cash left</span>
          <span class="muted ${left < 0 ? 'over' : ''}">${money(left)}</span>
        </div>
        ${!r.premium?.neverExpireLemons
          ? `<p class="muted" style="margin-top:10px">Lemons spoil after ${S.LEMON_SHELF_LIFE_DAYS} days in the cooler.
             <button class="link-btn" data-act="open-premium">Never let that happen →</button></p>`
          : ''}
      </div>
      <div class="card">
        <h2>Quick stock-up</h2>
        <div class="chip-row">
          <button class="chip" data-act="preset" data-cups="25">25 cups</button>
          <button class="chip" data-act="preset" data-cups="50">50 cups</button>
          <button class="chip" data-act="preset" data-cups="100">100 cups</button>
          <button class="chip" data-act="clear-order">Clear</button>
        </div>
        <p class="muted" style="margin-top:10px">Fills the order to pour that many cups with your current recipe, as far as your cash goes.</p>
      </div>
      <div class="card">
        <h2>Enhancers <span class="muted" style="font-weight:600;text-transform:none;letter-spacing:0">· optional</span></h2>
        <p class="muted">Stock these and offer them at the stand for extra per cup. Nobody has to take one — it is pure upside when they do.</p>
        ${enhancerRows}
      </div>
      <p class="muted center">That is enough for <strong>${pourable}</strong> cup${pourable === 1 ? '' : 's'} today.</p>`,
    actions: `
      <button class="btn" data-act="confirm-buy" ${cost > r.money ? 'disabled' : ''}>
        ${cost > 0 ? `Buy for ${money(cost)}` : 'Skip Shopping'}
      </button>`,
  };
}

function setupScreen() {
  const r = run();
  const pourable = S.maxCupsAvailable(r.inventory, r.recipe);
  const unitCost = S.costPerCup(r.recipe, r.today.prices);
  const margin = r.price - unitCost;

  const cupStock = { small: r.inventory.cupsSmall, medium: r.inventory.cups, large: r.inventory.cupsLarge };
  const sizeRows = Object.values(S.CUP_SIZES).map((size) => {
    const stock = cupStock[size.id];
    const price = size.id === 'medium' ? r.price : r.cupPrices[size.id];
    const cost = S.costPerCupSized(r.recipe, r.today.prices, size.id);
    const group = size.id === 'medium' ? 'price' : 'cupPrice';
    const field = size.id === 'medium' ? 'price' : size.id;
    return `<div class="row">
        <div class="row-main">
          <div class="row-name">${size.icon} ${size.label} <span class="muted" style="font-weight:600">· ${size.material}</span></div>
          <div class="row-sub">${stock} in the cooler · costs ${cents(cost)} to pour</div>
        </div>
        ${stepper(group, field, price, 0.05, 0.05, 5, money(price))}
      </div>`;
  }).join('');

  const byoPrice = r.cupPrices.byo;
  const byoCost = S.costPerCupSized(r.recipe, r.today.prices, 'byo');
  const byoRow = r.byoAccepted
    ? `<div class="row">
        <div class="row-main">
          <div class="row-name">🌱 BYO Cup</div>
          <div class="row-sub">no cup to buy · costs ${cents(byoCost)} to pour</div>
        </div>
        ${stepper('cupPrice', 'byo', byoPrice, 0.05, 0.05, 5, money(byoPrice))}
      </div>
      <button class="chip chip-on" data-act="toggle-byo" style="margin-top:8px">Accepting BYO ✓</button>`
    : `<div class="row">
        <div class="row-main">
          <div class="row-name">🌱 Bring Your Own Cup</div>
          <div class="row-sub">customers use their own container — no cup cost to you</div>
        </div>
        <button class="chip" data-act="toggle-byo">Accept It</button>
      </div>`;

  const cardRow = r.acceptCards
    ? `<div class="row">
        <div class="row-main">
          <div class="row-name">💳 Accepting Cards ✓</div>
          <div class="row-sub">customers pay a ${Math.round(S.CARD_CONVENIENCE_RATE * 100)}% convenience fee ·
            it costs you ${(S.CARD_PROCESSING_RATE * 100).toFixed(1)}% to process</div>
        </div>
        <button class="chip chip-on" data-act="toggle-cards">Stop Accepting</button>
      </div>`
    : `<div class="row">
        <div class="row-main">
          <div class="row-name">💳 Accept Card Payments</div>
          <div class="row-sub">some customers without cash on hand will pay by card instead</div>
        </div>
        <button class="chip" data-act="toggle-cards">Accept It</button>
      </div>`;

  const enhancerToggles = Object.values(S.ENHANCERS).map((enh) => {
    const stock = r.inventory.enhancers?.[enh.id] || 0;
    const offered = !!r.enhancersOffered?.[enh.id];
    return `<div class="row">
        <div class="row-main">
          <div class="row-name">${enh.icon} ${enh.label}</div>
          <div class="row-sub">${stock > 0 ? `${stock} in stock · +${money(enh.addPrice)} a cup` : 'none in stock'}</div>
        </div>
        <button class="chip ${offered ? 'chip-on' : ''}" data-act="toggle-enhancer" data-id="${enh.id}"
                ${stock === 0 ? 'disabled' : ''}>
          ${offered ? 'Offering ✓' : 'Offer It'}
        </button>
      </div>`;
  }).join('');

  return {
    body: `
      <h1>The Stand</h1>
      <div class="card">
        <h2>Recipe · one pitcher makes ${S.CUPS_PER_PITCHER} cups</h2>
        ${row('Lemons 🍋', 'per pitcher', stepper('recipe', 'lemons', r.recipe.lemons, 1, 1, 12))}
        ${row('Sugar 🥄', 'per pitcher', stepper('recipe', 'sugar', r.recipe.sugar, 1, 1, 12))}
        ${row('Ice 🧊', `per cup · it is ${r.today.temp}°F out`, stepper('recipe', 'ice', r.recipe.ice, 1, 0, 7))}
      </div>
      <div class="card">
        <h2>Price per cup</h2>
        ${sizeRows}
        <div class="facts" style="margin-top:12px">
          ${fact('Profit per medium', money(margin), margin > 0 ? 'good' : 'bad')}
          ${fact('Cups ready', pourable, pourable === 0 ? 'bad' : '')}
        </div>
      </div>
      <div class="card">
        <h2>Bring your own cup</h2>
        ${byoRow}
      </div>
      <div class="card">
        <h2>Payment</h2>
        ${cardRow}
      </div>
      <div class="card">
        <h2>Enhancers on offer</h2>
        ${enhancerToggles}
        <p class="muted" style="margin-top:10px">Only stocked enhancers can be offered. Customers who want one pay extra — it never affects whether the cup itself sells.</p>
      </div>
      ${pourable === 0 ? '<p class="muted center">Nothing to pour. Buy supplies, use less per pitcher — or sit this one out.</p>' : ''}`,
    actions: `
      <button class="btn" data-act="open-stand">${pourable === 0 ? 'Stay Closed Today' : 'Open for Business'}</button>
      <button class="btn-ghost" data-act="back-to-buy">Back to Supplies</button>`,
  };
}

const FACES = ['🧑', '👩', '🧒', '👴', '👱‍♀️', '🧔', '👧', '🧓', '👨', '👩‍🦰'];

function openScreen() {
  const r = run();
  const w = S.WEATHER[r.today.weather];
  return {
    body: `
      <h1>Day ${r.day}</h1>
      <div class="card center">
        <div class="weather-icon">${w.icon}</div>
        <div class="stand">
          <div class="stand-count" id="tick-count">0<small>cups sold</small></div>
          <div class="till" id="tick-till">$0.00</div>
        </div>
        <div class="queue" id="tick-queue"></div>
        <div class="progress"><i id="tick-bar"></i></div>
      </div>
      <p class="muted center">Tap to skip ahead</p>`,
    actions: '',
    mounted: () => playDay(store.ui.pending),
  };
}

function playDay(result) {
  const countEl = document.getElementById('tick-count');
  const tillEl = document.getElementById('tick-till');
  const queueEl = document.getElementById('tick-queue');
  const barEl = document.getElementById('tick-bar');
  const screenEl = document.getElementById('screen');
  if (!countEl) return;

  const total = result.sold;
  const duration = 2200;
  const started = performance.now();
  let shown = -1;
  let frameId = null;

  const finish = () => {
    if (frameId) cancelAnimationFrame(frameId);
    countEl.innerHTML = `${total}<small>cups sold</small>`;
    tillEl.textContent = money(result.revenue);
    barEl.style.width = '100%';
    run().phase = 'report';
    render();
  };

  const frame = (now) => {
    const t = Math.min(1, (now - started) / duration);
    const sold = Math.round(total * t);
    if (sold !== shown) {
      shown = sold;
      countEl.innerHTML = `${sold}<small>cups sold</small>`;
      tillEl.textContent = money(sold * result.price);
      const faces = Math.min(12, sold);
      queueEl.innerHTML = Array.from({ length: faces },
        (_, i) => `<span>${FACES[(i + sold) % FACES.length]}</span>`).join('');
    }
    barEl.style.width = `${t * 100}%`;
    if (t < 1) frameId = requestAnimationFrame(frame);
    else setTimeout(finish, 400);
  };

  frameId = requestAnimationFrame(frame);
  screenEl.addEventListener('click', finish, { once: true });
}

function reportScreen() {
  const r = run();
  const result = store.ui.pending;
  const w = S.WEATHER[result.weather];
  const last = r.day >= r.days;
  const enhancerLines = Object.entries(result.enhancers || {}).map(([id, s]) => {
    const enh = S.ENHANCERS[id];
    return `<li>${enh.icon} ${s.cups} customer${s.cups === 1 ? '' : 's'} added ${enh.label.toLowerCase()} for ${money(s.revenue)}.</li>`;
  }).join('');
  const sizeIcons = { small: '🥤', medium: '🧋', large: '🧋', byo: '🌱' };
  const sizeLabels = { small: 'Small', medium: 'Medium', large: 'Large', byo: 'BYO' };
  const soldSizeCount = Object.values(result.sizes || {}).filter((s) => s.sold > 0).length;
  const sizeLines = soldSizeCount > 1
    ? Object.entries(result.sizes || {}).filter(([, s]) => s.sold > 0).map(([id, s]) =>
        `<li>${sizeIcons[id]} ${sizeLabels[id]}: ${s.sold} cup${s.sold === 1 ? '' : 's'} for ${money(s.revenue)}.</li>`).join('')
    : '';

  return {
    body: `
      <h1>Day ${result.day} · closed</h1>
      <div class="card">
        <div class="facts">
          ${fact('Cups sold', `${result.sold}${result.stock > 0 && result.sold === result.stock ? ' (sold out)' : ''}`)}
          ${fact('Taken', money(result.revenue), 'good')}
          ${fact('Supplies used', money(result.cogs))}
          ${fact("Day's profit", money(result.profit), result.profit >= 0 ? 'good' : 'bad')}
        </div>
        ${result.enhancerRevenue > 0 ? `<p class="muted" style="margin-top:8px">Enhancers added ${money(result.enhancerRevenue)} on top of the base price.</p>` : ''}
        ${result.cardCups > 0 ? `<p class="muted" style="margin-top:8px">💳 ${result.cardCups} customer${result.cardCups === 1 ? '' : 's'} paid by card —
           ${money(result.cardFeeRevenue)} in convenience fees against ${money(result.cardProcessingCost)} to process.</p>` : ''}
        <ul class="notes">
          ${result.notes.map((n) => `<li>${n}</li>`).join('')}
          ${sizeLines}
          ${enhancerLines}
          ${result.rent > 0 ? `<li>🏠 Pitch fee of ${money(result.rent)} came out of the till.</li>` : ''}
          <li>${w.icon} ${w.label}, ${result.temp}°F · about ${result.potential} people walked past.</li>
          <li>Reputation ${result.repDelta >= 0 ? 'rose ↑' : 'slipped ↓'} — word gets around.</li>
        </ul>
      </div>`,
    actions: `<button class="btn" data-act="next-day">${last ? 'Close the Books' : 'Next Morning'}</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * End of a run
 * ------------------------------------------------------------------ */

function runOverScreen() {
  const r = run();
  const score = S.finalScore(r);
  const profits = r.history.map((d) => d.profit);
  const peak = Math.max(1, ...profits.map(Math.abs));
  const chart = `
    <div class="chart" aria-hidden="true">
      ${profits.map((p) => {
        const h = Math.max(2, Math.round((Math.abs(p) / peak) * 42));
        return `<div class="chart-col">
          <div class="chart-pos">${p >= 0 ? `<i style="height:${h}px"></i>` : ''}</div>
          <div class="chart-neg">${p < 0 ? `<i style="height:${h}px"></i>` : ''}</div>
        </div>`;
      }).join('')}
    </div>`;

  if (!r.corner) {
    recordBest(score.money);
    return {
      body: `
        <div class="rank">
          <div class="rank-icon">${score.rank.icon}</div>
          <div class="rank-title">${score.rank.title}</div>
          <p class="muted">${score.bankrupt
            ? 'You ran out of money before the season ended.'
            : `You finished ${r.days} days with ${money(score.money)}.`}</p>
        </div>
        <div class="card">
          <h2>The season</h2>
          <div class="facts">
            ${fact('Final cash', money(score.money), score.net >= 0 ? 'good' : 'bad')}
            ${fact('Net', `${score.net >= 0 ? '+' : ''}${money(score.net)}`, score.net >= 0 ? 'good' : 'bad')}
            ${fact('Cups sold', score.cupsSold)}
            ${fact('Best day', score.bestDay ? money(score.bestDay.profit) : '—')}
          </div>
          ${score.enhancerCups > 0 ? `<p class="muted" style="margin-top:8px">${score.enhancerCups} enhancers sold for ${money(score.enhancerRevenue)} on top of the base price.</p>` : ''}
          ${store.ui.interestEarned > 0 ? `<p class="muted good" style="margin-top:8px">🏦 Your bank balance earned ${money(store.ui.interestEarned)} in interest while you played.</p>` : ''}
          ${store.ui.wagesPaid > 0 ? `<p class="muted" style="margin-top:8px">🧑‍💼 Your office was paid ${money(store.ui.wagesPaid)} for the days you were out.</p>` : ''}
          ${chart}
          <p class="muted" style="margin-top:6px">Daily profit, day 1 → ${r.history.length}</p>
        </div>`,
      actions: `
        <button class="btn" data-act="free-play">Play Again</button>
        <button class="btn-ghost" data-act="to-title">Menu</button>`,
    };
  }

  const city = C.getCity(r.corner.cityId);
  const won = score.won;
  const claimed = store.ui.claimResult;
  return {
    body: `
      <div class="rank">
        <div class="rank-icon">${won ? '🏅' : score.bankrupt ? '💸' : '😬'}</div>
        <div class="rank-title">${won ? 'Corner Claimed' : score.bankrupt ? 'Out of Business' : 'Short of the Target'}</div>
        <p class="muted">${r.corner.name} · ${city.flag} ${city.name}</p>
      </div>
      <div class="card">
        <div class="facts">
          ${fact('Profit made', money(score.net), score.net >= 0 ? 'good' : 'bad')}
          ${fact('Target', whole(r.target), won ? 'good' : 'bad')}
          ${fact('Cups sold', score.cupsSold)}
          ${fact('Days traded', r.history.length)}
        </div>
        ${chart}
        <p class="muted" style="margin-top:6px">Daily profit across the run</p>
      </div>
      ${won
        ? `<div class="card">
             <p>${money(score.net)} goes into the treasury.</p>
             ${store.ui.interestEarned > 0 ? `<p class="muted good">🏦 Your bank balance earned ${money(store.ui.interestEarned)} in interest while you played.</p>` : ''}
             ${store.ui.wagesPaid > 0 ? `<p class="muted">🧑‍💼 Your office was paid ${money(store.ui.wagesPaid)} for the days you were out.</p>` : ''}
             ${claimed?.cityJustDone ? `<p class="good"><strong>${city.name} is yours — all ${C.CORNERS_PER_CITY} corners.</strong></p>` : ''}
             ${claimed?.opsJustUnlocked ? '<p class="good"><strong>🏭 Operations unlocked.</strong> You can now run depots, buy wholesale and staff the corners you own.</p>' : ''}
           </div>`
        : `<div class="card">
             <p class="muted">The weather on a corner never changes — the same days are waiting for you. Try a different recipe, or a different price.</p>
           </div>`}`,
    actions: won
      ? `<button class="btn" data-act="next-after-win">Next Corner</button>
         <button class="btn-ghost" data-act="to-city">${city.name}</button>`
      : `<button class="btn" data-act="retry-corner">Try This Corner Again</button>
         <button class="btn-ghost" data-act="to-city">Back to ${city.name}</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

const emptyOrder = () => ({ lemons: 0, sugar: 0, ice: 0, cups: 0, cupsSmall: 0, cupsLarge: 0, enhancers: zeroedEnhancers() });

/**
 * What you would need to add to the cooler to pour `cups` medium cups today.
 * Small cups, large cups and enhancers are deliberate, separate purchases —
 * a stock-up preset for the classic size should never silently touch them.
 */
function orderFor(cups) {
  const r = run();
  const pitchers = Math.ceil(cups / S.CUPS_PER_PITCHER);
  const need = (have, want) => Math.max(0, want - have);
  return {
    lemons: need(r.inventory.lemons, pitchers * r.recipe.lemons),
    sugar: need(r.inventory.sugar, pitchers * r.recipe.sugar),
    ice: need(r.inventory.ice, cups * r.recipe.ice),
    cups: need(r.inventory.cups, cups),
    cupsSmall: store.ui.order.cupsSmall,
    cupsLarge: store.ui.order.cupsLarge,
    enhancers: store.ui.order.enhancers,
  };
}

/**
 * Fill the basket for `cups` cups, or the most the cash will cover. Solved as
 * a whole order rather than trimmed line by line, so it stays balanced — no
 * paying for ice that melts before there is lemonade to put it in.
 */
function presetOrder(cups) {
  const r = run();
  const prices = r.today.prices;
  if (S.buyCost(prices, orderFor(cups)) <= r.money) {
    store.ui.order = orderFor(cups);
    return;
  }
  let lo = 0;
  let hi = cups;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (S.buyCost(prices, orderFor(mid)) <= r.money) lo = mid;
    else hi = mid - 1;
  }
  store.ui.order = orderFor(lo);
}

/** A corner's run config, with the bar it has to clear attached. */
function cornerRun(cityId, index) {
  return {
    ...C.runConfigFor(cityId, index),
    target: C.targetFor(store.campaign, cityId, index),
  };
}

function startRun(config) {
  store.run = S.newRun({
    ...config,
    premium: { neverExpireLemons: isPremiumUnlocked('neverExpireLemons') },
  });
  store.ui.order = emptyOrder();
  store.ui.pending = null;
  store.ui.claimResult = null;
  store.ui.view = 'run';
}

/** Settle a finished run: bank a win, let the network trade, check achievements. */
function settleRun() {
  const r = run();
  if (r.settled) return [];
  r.settled = true;
  const score = S.finalScore(r);

  if (r.corner) {
    const campaign = store.campaign;
    campaign.stats.runsPlayed += 1;
    campaign.stats.cupsSold += score.cupsSold;

    if (score.won) {
      campaign.stats.runsWon += 1;
      recordTierWon(r.corner.tier);
      store.ui.claimResult = C.claimCorner(campaign, r.corner.cityId, r.corner.index, score.net);
      if (store.ui.claimResult.opsJustUnlocked && !campaign.ops) campaign.ops = newOps();
    }
    if (campaign.ops) {
      const summary = tickOps(campaign, r.history.length);
      store.ui.opsReport = summary && summary.days > 0 ? summary : null;
    }
  }

  store.ui.interestEarned = 0;
  store.ui.wagesPaid = 0;
  if (store.campaign) {
    const earned = B.accrueInterest(store.campaign, r.history.length, Emp.interestBonus(store.campaign));
    if (earned > 0) {
      recordInterest(earned);
      store.ui.interestEarned = earned;
    }
    store.ui.wagesPaid = Emp.payWages(store.campaign, r.history.length);
  }

  const cleanRunFinished = r.history.every((d) => !(d.spoiledLemons > 0));
  const avgQuality = r.history.length ? r.history.reduce((n, d) => n + d.quality, 0) / r.history.length : 0;
  const allSizesInADay = r.history.some((d) => Object.values(d.sizes || {}).filter((s) => s.sold > 0).length >= 4);
  return checkAchievements({
    cleanRunFinished,
    consistentQuality: avgQuality,
    allSizesInADay,
    topRankFreePlay: !r.corner && !score.bankrupt && score.rank?.title === 'Lemonade Tycoon',
  });
}

export const screens = {
  forecast: forecastScreen,
  buy: buyScreen,
  setup: setupScreen,
  open: openScreen,
  report: reportScreen,
  gameover: runOverScreen,
};

export const actions = {
  'free-play': () => startRun({ days: S.TOTAL_DAYS, stake: S.STARTING_MONEY }),
  'start-run': () => startRun(cornerRun(store.ui.cityId, store.ui.cornerIndex)),
  'retry-corner': () => startRun(cornerRun(store.run.corner.cityId, store.run.corner.index)),
  'next-after-win': () => {
    const cityId = store.run.corner.cityId;
    store.run = null;
    store.ui.cityId = cityId;
    const next = C.nextCorner(store.campaign, cityId);
    if (next == null) {
      store.ui.view = 'city';
    } else {
      store.ui.cornerIndex = next;
      store.ui.view = 'corner';
    }
  },
  'quit-run': () => {
    const corner = store.run?.corner;
    store.run = null;
    store.ui.view = corner ? 'city' : 'title';
  },
  'to-buy': () => { store.ui.order = emptyOrder(); run().phase = 'buy'; },
  preset: (el) => presetOrder(Number(el.dataset.cups)),
  'clear-order': () => { store.ui.order = emptyOrder(); },
  'confirm-buy': () => {
    const r = run();
    const order = store.ui.order;
    const cost = Math.round((
      S.buyCost(r.today.prices, order) +
      S.sizedCupOrderCost(r.today.prices, order) +
      S.enhancerOrderCost(order.enhancers)
    ) * 100) / 100;
    if (cost > r.money) return;
    r.money = Math.round((r.money - cost) * 100) / 100;
    S.receiveOrder(r, order);
    store.ui.order = emptyOrder();
    r.phase = 'setup';
  },
  'back-to-buy': () => { run().phase = 'buy'; },
  'toggle-enhancer': (el) => {
    const r = run();
    const id = el.dataset.id;
    if ((r.inventory.enhancers?.[id] || 0) === 0) return; // nothing to offer
    r.enhancersOffered[id] = !r.enhancersOffered[id];
    const offeredTogether = Object.values(r.enhancersOffered).filter(Boolean).length;
    const toast = achievementToast(checkAchievements({ enhancersOfferedTogether: offeredTogether }));
    if (toast) store.ui.notice = toast;
  },
  'open-premium': () => { store.ui.showPremium = true; },
  'toggle-byo': () => { run().byoAccepted = !run().byoAccepted; },
  'toggle-cards': () => { run().acceptCards = !run().acceptCards; },
  'open-stand': () => {
    store.ui.pending = S.simulateDay(run());
    run().phase = 'open';
  },
  'next-day': () => {
    const pending = store.ui.pending;
    S.commitDay(run(), pending);
    store.ui.pending = null;
    recordDay(pending, run().money);
    const dayNewly = checkAchievements({
      soldOutToday: pending.stock > 0 && pending.sold === pending.stock,
      bestQualityToday: pending.quality,
      cupsToday: pending.sold,
    });
    const runNewly = run().phase === 'gameover' ? settleRun() : [];
    const toast = achievementToast([...dayNewly, ...runNewly]);
    if (toast) store.ui.notice = toast;
  },
};
