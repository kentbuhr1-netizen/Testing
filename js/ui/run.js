/** The day loop: forecast, supplies, the stand, opening up, and the report. */
import * as S from '../sim.js';
import * as C from '../campaign.js';
import { tickOps, newOps } from '../ops.js';
import { store, render, recordBest } from '../store.js';
import { money, whole, cents, fact, stepper, row, tierPill } from './kit.js';

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
          ${fact('Cups', r.inventory.cups)}
        </div>
        ${yesterday?.melted > 0
          ? `<p class="muted" style="margin-top:10px">${yesterday.melted} ice cube${yesterday.melted === 1 ? '' : 's'} melted overnight.</p>`
          : ''}
      </div>
      ${yesterday ? `<p class="muted center">Yesterday you sold ${yesterday.sold} cup${yesterday.sold === 1 ? '' : 's'} for ${money(yesterday.revenue)}.</p>` : ''}`,
    actions: `
      <button class="btn" data-act="to-buy">Go Shopping</button>
      <button class="btn-ghost" data-act="quit-run">${r.corner ? 'Give Up On This Corner' : 'Menu'}</button>`,
  };
}

function buyScreen() {
  const r = run();
  const p = r.today.prices;
  const o = store.ui.order;
  const cost = S.buyCost(p, o);
  const left = r.money - cost;
  const after = {
    lemons: r.inventory.lemons + o.lemons,
    sugar: r.inventory.sugar + o.sugar,
    ice: r.inventory.ice + o.ice,
    cups: r.inventory.cups + o.cups,
  };
  const pourable = S.maxCupsAvailable(after, r.recipe);
  const line = (key, name, unit, step) =>
    row(name, `${cents(p[unit])} each · cooler: ${after[key]}`,
        stepper('order', key, o[key], step, 0, 9999));

  return {
    body: `
      <h1>Supplies</h1>
      <p class="muted">Prices move a little every day. Buy for the weather you are expecting.</p>
      <div class="card">
        ${line('lemons', 'Lemons 🍋', 'lemon', 5)}
        ${line('sugar', 'Sugar 🥄', 'sugar', 5)}
        ${line('ice', 'Ice cubes 🧊', 'ice', 25)}
        ${line('cups', 'Paper cups 🥤', 'cup', 10)}
        <div class="total">
          <span>Total</span>
          <span class="${cost > r.money ? 'over' : ''}">${money(cost)}</span>
        </div>
        <div class="total subtotal">
          <span class="muted">Cash left</span>
          <span class="muted ${left < 0 ? 'over' : ''}">${money(left)}</span>
        </div>
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
        ${row('What you charge', `costs you ${cents(unitCost)} to pour`,
              stepper('price', 'price', r.price, 0.05, 0.05, 5, money(r.price)))}
        <div class="facts" style="margin-top:12px">
          ${fact('Profit per cup', money(margin), margin > 0 ? 'good' : 'bad')}
          ${fact('Cups ready', pourable, pourable === 0 ? 'bad' : '')}
        </div>
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
        <ul class="notes">
          ${result.notes.map((n) => `<li>${n}</li>`).join('')}
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

const emptyOrder = () => ({ lemons: 0, sugar: 0, ice: 0, cups: 0 });

/** What you would need to add to the cooler to pour `cups` cups today. */
function orderFor(cups) {
  const r = run();
  const pitchers = Math.ceil(cups / S.CUPS_PER_PITCHER);
  const need = (have, want) => Math.max(0, want - have);
  return {
    lemons: need(r.inventory.lemons, pitchers * r.recipe.lemons),
    sugar: need(r.inventory.sugar, pitchers * r.recipe.sugar),
    ice: need(r.inventory.ice, cups * r.recipe.ice),
    cups: need(r.inventory.cups, cups),
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
  store.run = S.newRun(config);
  store.ui.order = emptyOrder();
  store.ui.pending = null;
  store.ui.claimResult = null;
  store.ui.view = 'run';
}

/** Settle a finished run: bank a win, and let the network trade for those days. */
function settleRun() {
  const r = run();
  if (!r.corner || r.settled) return;
  r.settled = true;
  const score = S.finalScore(r);
  const campaign = store.campaign;
  campaign.stats.runsPlayed += 1;
  campaign.stats.cupsSold += score.cupsSold;

  if (score.won) {
    campaign.stats.runsWon += 1;
    store.ui.claimResult = C.claimCorner(campaign, r.corner.cityId, r.corner.index, score.net);
    if (store.ui.claimResult.opsJustUnlocked && !campaign.ops) campaign.ops = newOps();
  }
  if (campaign.ops) {
    const summary = tickOps(campaign, r.history.length);
    store.ui.opsReport = summary && summary.days > 0 ? summary : null;
  }
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
    const cost = S.buyCost(r.today.prices, store.ui.order);
    if (cost > r.money) return;
    r.money = Math.round((r.money - cost) * 100) / 100;
    for (const key of Object.keys(store.ui.order)) r.inventory[key] += store.ui.order[key];
    store.ui.order = emptyOrder();
    r.phase = 'setup';
  },
  'back-to-buy': () => { run().phase = 'buy'; },
  'open-stand': () => {
    store.ui.pending = S.simulateDay(run());
    run().phase = 'open';
  },
  'next-day': () => {
    S.commitDay(run(), store.ui.pending);
    store.ui.pending = null;
    if (run().phase === 'gameover') settleRun();
  },
};
