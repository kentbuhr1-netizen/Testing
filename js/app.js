/**
 * Lemonade Stand — UI layer.
 *
 * Owns the DOM, the save file and the flow between phases. All the rules live
 * in sim.js; nothing here decides how many cups get sold.
 */
import * as S from './sim.js';

const SAVE_KEY = 'lemonade-stand-save-v1';
const BEST_KEY = 'lemonade-stand-best-v1';

const screenEl = document.getElementById('screen');
const actionsEl = document.getElementById('actions');
const hudEl = document.getElementById('hud');

/** Persistent game state (null while the title screen is up). */
let game = null;
/** Throwaway view state that never needs saving. */
let ui = { order: emptyOrder(), pending: null, lastPhase: null, animation: null, showHelp: false };

const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
const cents = (n) => `${Math.round(n * 100)}¢`;

function emptyOrder() {
  return { lemons: 0, sugar: 0, ice: 0, cups: 0 };
}

/* ------------------------------------------------------------------ *
 * Saving
 * ------------------------------------------------------------------ */

function save() {
  if (!game) return; // on the title screen: leave any saved season alone
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  } catch {
    /* private mode, full quota — the game still plays, it just won't resume */
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.today && data.inventory ? data : null;
  } catch {
    return null;
  }
}

function bestScore() {
  const n = Number(localStorage.getItem(BEST_KEY));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function recordBest(amount) {
  try {
    if (amount > bestScore()) localStorage.setItem(BEST_KEY, String(amount));
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

const SCREENS = {
  title: titleScreen,
  help: helpScreen,
  forecast: forecastScreen,
  buy: buyScreen,
  setup: setupScreen,
  open: openScreen,
  report: reportScreen,
  gameover: gameOverScreen,
};

function render() {
  const phase = ui.showHelp ? 'help' : game ? game.phase : 'title';
  const view = SCREENS[phase]();

  screenEl.innerHTML = view.body;
  actionsEl.innerHTML = view.actions ?? '';
  actionsEl.hidden = !view.actions;

  const inGame = Boolean(game) && !ui.showHelp;
  hudEl.hidden = !inGame;
  if (inGame) updateHud();

  // Only replay the entrance animation when the screen actually changed.
  if (ui.lastPhase !== phase) {
    screenEl.style.animation = 'none';
    void screenEl.offsetWidth;
    screenEl.style.animation = '';
    ui.lastPhase = phase;
  }
  view.mounted?.();
  save();
}

function updateHud() {
  const pendingCash = ui.pending ? ui.pending.revenue : 0;
  document.getElementById('hud-day').textContent = `${Math.min(game.day, S.TOTAL_DAYS)}/${S.TOTAL_DAYS}`;
  document.getElementById('hud-money').textContent = money(game.money + pendingCash);
  document.getElementById('hud-rep-fill').style.width = `${Math.round(game.reputation * 100)}%`;
}

function weatherOf(state) {
  return S.WEATHER[state.today.weather];
}

/* ------------------------------------------------------------------ *
 * Screens
 * ------------------------------------------------------------------ */

function titleScreen() {
  const best = bestScore();
  const saved = load();
  return {
    body: `
      <div class="title-art">🍋</div>
      <div class="center">
        <h1>Lemonade Stand</h1>
        <p class="muted">Thirty days. Twenty dollars. One corner.<br />Read the weather, mix the pitcher, name your price.</p>
        ${best ? `<p class="muted">Best season: <strong>${money(best)}</strong></p>` : ''}
      </div>`,
    actions: `
      ${saved ? '<button class="btn" data-act="continue">Continue Day ' + Math.min(saved.day, S.TOTAL_DAYS) + '</button>' : ''}
      <button class="${saved ? 'btn-ghost' : 'btn'}" data-act="new-game">New Season</button>
      <button class="btn-ghost" data-act="help">How to Play</button>`,
  };
}

function helpScreen() {
  return {
    body: `
      <h1>How to Play</h1>
      <div class="card">
        <h2>The loop</h2>
        <p>Each morning you get a forecast. Buy supplies, mix a pitcher, set a price, then open up and watch how the day goes.</p>
      </div>
      <div class="card">
        <h2>What matters</h2>
        <p><strong>Heat sells.</strong> A scorcher brings crowds and loosens wallets. Rain empties the street.</p>
        <p><strong>Taste is a secret recipe.</strong> There's one balance of lemons and sugar that people love — customers only tell you when it's off. More ice on hotter days.</p>
        <p><strong>Price is a trade.</strong> Charge more per cup and fewer people buy. Your reputation grows when the lemonade is worth what you charged.</p>
      </div>
      <div class="card">
        <h2>The catch</h2>
        <p>One pitcher pours ${S.CUPS_PER_PITCHER} cups, and you only use up what you sell — but <strong>every ice cube melts overnight</strong>. Buy ice for the day you're having, not the week.</p>
      </div>`,
    actions: `<button class="btn" data-act="back">Back</button>`,
  };
}

function forecastScreen() {
  const w = weatherOf(game);
  const t = game.today;
  const yesterday = game.history[game.history.length - 1];
  return {
    body: `
      <h1>Day ${game.day}</h1>
      <div class="card">
        <div class="weather">
          <div class="weather-icon">${w.icon}</div>
          <div class="weather-main">
            <div class="weather-temp">${t.temp}°F</div>
            <div class="weather-label">${w.label}</div>
          </div>
        </div>
        ${t.event ? `<div class="headline">📣 ${t.event.text}</div>` : ''}
      </div>
      <div class="card">
        <h2>In the cooler</h2>
        <div class="facts">
          ${fact('Lemons', game.inventory.lemons)}
          ${fact('Sugar', game.inventory.sugar)}
          ${fact('Ice', game.inventory.ice + ' 🧊')}
          ${fact('Cups', game.inventory.cups)}
        </div>
        ${yesterday?.melted > 0
          ? `<p class="muted" style="margin-top:10px">${yesterday.melted} ice cube${yesterday.melted === 1 ? '' : 's'} melted overnight.</p>`
          : ''}
      </div>
      ${yesterday ? `<p class="muted center">Yesterday you sold ${yesterday.sold} cup${yesterday.sold === 1 ? '' : 's'} for ${money(yesterday.revenue)}.</p>` : ''}`,
    actions: `
      <button class="btn" data-act="to-buy">Go Shopping</button>
      <button class="btn-ghost" data-act="to-title">Menu</button>`,
  };
}

function fact(label, value, cls = '') {
  return `<div class="fact"><div class="fact-label">${label}</div><div class="fact-value ${cls}">${value}</div></div>`;
}

function buyScreen() {
  const p = game.today.prices;
  const o = ui.order;
  const cost = S.buyCost(p, o);
  const left = game.money - cost;
  const after = {
    lemons: game.inventory.lemons + o.lemons,
    sugar: game.inventory.sugar + o.sugar,
    ice: game.inventory.ice + o.ice,
    cups: game.inventory.cups + o.cups,
  };
  const pourable = S.maxCupsAvailable(after, game.recipe);

  const line = (key, name, unit, step) => `
    <div class="row">
      <div class="row-main">
        <div class="row-name">${name}</div>
        <div class="row-sub">${cents(p[unit])} each · cooler: ${after[key]}</div>
      </div>
      ${stepper(key, o[key], step, 0, 999, 'order')}
    </div>`;

  return {
    body: `
      <h1>Supplies</h1>
      <p class="muted">Prices move a little every day. Buy for the weather you're expecting.</p>
      <div class="card">
        ${line('lemons', 'Lemons 🍋', 'lemon', 5)}
        ${line('sugar', 'Sugar 🥄', 'sugar', 5)}
        ${line('ice', 'Ice cubes 🧊', 'ice', 25)}
        ${line('cups', 'Paper cups 🥤', 'cup', 10)}
        <div class="total">
          <span>Total</span>
          <span class="${cost > game.money ? 'over' : ''}">${money(cost)}</span>
        </div>
        <div class="total" style="border:0;padding-top:4px;margin-top:0;font-size:14px;font-weight:600">
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
      <p class="muted center">That's enough for <strong>${pourable}</strong> cup${pourable === 1 ? '' : 's'} today.</p>`,
    actions: `
      <button class="btn" data-act="confirm-buy" ${cost > game.money ? 'disabled' : ''}>
        ${cost > 0 ? `Buy for ${money(cost)}` : 'Skip Shopping'}
      </button>`,
  };
}

function setupScreen() {
  const r = game.recipe;
  const pourable = S.maxCupsAvailable(game.inventory, r);
  const unitCost = S.costPerCup(r, game.today.prices);
  const margin = game.price - unitCost;

  return {
    body: `
      <h1>The Stand</h1>
      <div class="card">
        <h2>Recipe · one pitcher makes ${S.CUPS_PER_PITCHER} cups</h2>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Lemons 🍋</div>
            <div class="row-sub">per pitcher</div>
          </div>
          ${stepper('lemons', r.lemons, 1, 1, 12, 'recipe')}
        </div>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Sugar 🥄</div>
            <div class="row-sub">per pitcher</div>
          </div>
          ${stepper('sugar', r.sugar, 1, 1, 12, 'recipe')}
        </div>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Ice 🧊</div>
            <div class="row-sub">per cup · it's ${game.today.temp}°F out</div>
          </div>
          ${stepper('ice', r.ice, 1, 0, 6, 'recipe')}
        </div>
      </div>
      <div class="card">
        <h2>Price per cup</h2>
        <div class="row">
          <div class="row-main">
            <div class="row-name">What you charge</div>
            <div class="row-sub">costs you ${cents(unitCost)} to pour</div>
          </div>
          ${stepper('price', game.price, 0.05, 0.05, 5, 'price', money(game.price))}
        </div>
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

function stepper(field, value, step, min, max, group, display) {
  const shown = display ?? value;
  return `
    <div class="stepper">
      <button data-act="step" data-group="${group}" data-field="${field}" data-step="${-step}"
              ${value <= min ? 'disabled' : ''} aria-label="Less ${field}">−</button>
      <output data-out="${group}.${field}">${shown}</output>
      <button data-act="step" data-group="${group}" data-field="${field}" data-step="${step}"
              ${value >= max ? 'disabled' : ''} aria-label="More ${field}">+</button>
    </div>`;
}

function openScreen() {
  const r = ui.pending;
  const w = weatherOf(game);
  return {
    body: `
      <h1>Day ${game.day}</h1>
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
    mounted: () => runDayAnimation(r),
  };
}

function reportScreen() {
  const r = ui.pending;
  const w = S.WEATHER[r.weather];
  const repUp = r.repDelta >= 0;
  return {
    body: `
      <h1>Day ${r.day} · closed</h1>
      <div class="card">
        <div class="facts">
          ${fact('Cups sold', `${r.sold}${r.stock > 0 && r.sold === r.stock ? ' (sold out)' : ''}`)}
          ${fact('Taken', money(r.revenue), 'good')}
          ${fact('Supplies used', money(r.cogs))}
          ${fact("Day's profit", money(r.profit), r.profit >= 0 ? 'good' : 'bad')}
        </div>
        <ul class="notes">
          ${r.notes.map((n) => `<li>${n}</li>`).join('')}
          <li>${w.icon} ${w.label}, ${r.temp}°F · about ${r.potential} people walked past.</li>
          <li>Reputation ${repUp ? 'rose ↑' : 'slipped ↓'} — word gets around.</li>
        </ul>
      </div>`,
    actions: `<button class="btn" data-act="next-day">${game.day >= S.TOTAL_DAYS ? 'Finish the Season' : 'Next Morning'}</button>`,
  };
}

function gameOverScreen() {
  const score = S.finalScore(game);
  recordBest(score.money);
  const profits = game.history.map((d) => d.profit);
  const peak = Math.max(1, ...profits.map(Math.abs));

  return {
    body: `
      <div class="rank">
        <div class="rank-icon">${score.rank.icon}</div>
        <div class="rank-title">${score.rank.title}</div>
        <p class="muted">${score.bankrupt
          ? 'You ran out of money before the season ended.'
          : `You finished ${S.TOTAL_DAYS} days with ${money(score.money)}.`}</p>
      </div>
      <div class="card">
        <h2>The season</h2>
        <div class="facts">
          ${fact('Final cash', money(score.money), score.net >= 0 ? 'good' : 'bad')}
          ${fact('Net', `${score.net >= 0 ? '+' : ''}${money(score.net)}`, score.net >= 0 ? 'good' : 'bad')}
          ${fact('Cups sold', score.cupsSold)}
          ${fact('Best day', score.bestDay ? `${money(score.bestDay.profit)}` : '—')}
        </div>
        <div class="chart" aria-hidden="true">
          ${profits.map((p) => {
            const h = Math.max(2, Math.round((Math.abs(p) / peak) * 42));
            return `<div class="chart-col">
              <div class="chart-pos">${p >= 0 ? `<i style="height:${h}px"></i>` : ''}</div>
              <div class="chart-neg">${p < 0 ? `<i style="height:${h}px"></i>` : ''}</div>
            </div>`;
          }).join('')}
        </div>
        <p class="muted" style="margin-top:6px">Daily profit, day 1 → ${game.history.length}</p>
      </div>`,
    actions: `
      <button class="btn" data-act="new-game">Play Again</button>
      <button class="btn-ghost" data-act="share">Share Result</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The day, played out
 * ------------------------------------------------------------------ */

const FACES = ['🧑', '👩', '🧒', '👴', '👱‍♀️', '🧔', '👧', '🧓', '👨', '👩‍🦰'];

function runDayAnimation(result) {
  const countEl = document.getElementById('tick-count');
  const tillEl = document.getElementById('tick-till');
  const queueEl = document.getElementById('tick-queue');
  const barEl = document.getElementById('tick-bar');
  if (!countEl) return;

  const total = result.sold;
  const duration = 2400;
  const started = performance.now();
  let shown = -1;

  const finish = () => {
    if (ui.animation) cancelAnimationFrame(ui.animation);
    ui.animation = null;
    countEl.innerHTML = `${total}<small>cups sold</small>`;
    tillEl.textContent = money(result.revenue);
    barEl.style.width = '100%';
    game.phase = 'report';
    render();
  };

  const frame = (now) => {
    const t = Math.min(1, (now - started) / duration);
    const sold = Math.round(total * t);
    if (sold !== shown) {
      shown = sold;
      countEl.innerHTML = `${sold}<small>cups sold</small>`;
      tillEl.textContent = money(sold * result.price);
      // Keep the queue short so it never reflows the card.
      const faces = Math.min(12, sold);
      queueEl.innerHTML = Array.from(
        { length: faces },
        (_, i) => `<span>${FACES[(i + sold) % FACES.length]}</span>`
      ).join('');
      updateHud();
    }
    barEl.style.width = `${t * 100}%`;
    if (t < 1) ui.animation = requestAnimationFrame(frame);
    else setTimeout(finish, 450);
  };

  ui.animation = requestAnimationFrame(frame);
  screenEl.addEventListener('click', finish, { once: true });
}

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

const LIMITS = {
  recipe: { lemons: [1, 12], sugar: [1, 12], ice: [0, 6] },
  price: { price: [0.05, 5] },
  order: { lemons: [0, 999], sugar: [0, 999], ice: [0, 999], cups: [0, 999] },
};

function applyStep(group, field, step) {
  const [min, max] = LIMITS[group][field];
  if (group === 'order') {
    const next = clamp(ui.order[field] + step, min, max);
    const trial = { ...ui.order, [field]: next };
    // Never let the basket exceed the cash on hand.
    if (step > 0 && S.buyCost(game.today.prices, trial) > game.money) return false;
    ui.order[field] = next;
  } else if (group === 'price') {
    game.price = Math.round(clamp(game.price + step, min, max) * 100) / 100;
  } else {
    game.recipe[field] = clamp(game.recipe[field] + step, min, max);
  }
  return true;
}

/** What you'd need to add to the cooler to pour `cups` cups today. */
function orderFor(cups) {
  const r = game.recipe;
  const pitchers = Math.ceil(cups / S.CUPS_PER_PITCHER);
  const need = (have, want) => Math.max(0, want - have);
  return {
    lemons: need(game.inventory.lemons, pitchers * r.lemons),
    sugar: need(game.inventory.sugar, pitchers * r.sugar),
    ice: need(game.inventory.ice, cups * r.ice),
    cups: need(game.inventory.cups, cups),
  };
}

/**
 * Fill the basket for `cups` cups, or for the most cups the cash will cover.
 * Solved as a whole order rather than trimmed line by line, so the basket
 * stays balanced — no paying for ice that melts before there's lemonade for it.
 */
function presetOrder(cups) {
  const prices = game.today.prices;
  if (S.buyCost(prices, orderFor(cups)) <= game.money) {
    ui.order = orderFor(cups);
    return;
  }
  let lo = 0;
  let hi = cups;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (S.buyCost(prices, orderFor(mid)) <= game.money) lo = mid;
    else hi = mid - 1;
  }
  ui.order = orderFor(lo);
}

const ACTIONS = {
  'new-game': () => {
    game = S.newGame();
    ui.order = emptyOrder();
    ui.pending = null;
  },
  continue: () => {
    game = load();
    ui.pending = null;
  },
  help: () => { ui.showHelp = true; },
  'to-title': () => { game = null; }, // the season stays saved
  back: () => { ui.showHelp = false; },
  'to-buy': () => {
    ui.order = emptyOrder();
    game.phase = 'buy';
  },
  preset: (el) => presetOrder(Number(el.dataset.cups)),
  'clear-order': () => { ui.order = emptyOrder(); },
  'confirm-buy': () => {
    const cost = S.buyCost(game.today.prices, ui.order);
    if (cost > game.money) return;
    game.money = Math.round((game.money - cost) * 100) / 100;
    for (const key of Object.keys(ui.order)) game.inventory[key] += ui.order[key];
    ui.order = emptyOrder();
    game.phase = 'setup';
  },
  'back-to-buy': () => { game.phase = 'buy'; },
  'open-stand': () => {
    ui.pending = S.simulateDay(game);
    game.phase = 'open';
  },
  'next-day': () => {
    S.commitDay(game, ui.pending);
    ui.pending = null;
  },
  share: async () => {
    const score = S.finalScore(game);
    const text = `🍋 Lemonade Stand — ${score.rank.icon} ${score.rank.title}\n${S.TOTAL_DAYS} days · ${money(score.money)} · ${score.cupsSold} cups sold`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch { /* the user dismissed the sheet */ }
  },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;

  if (act === 'step') {
    if (applyStep(el.dataset.group, el.dataset.field, Number(el.dataset.step))) render();
    return;
  }
  const handler = ACTIONS[act];
  if (!handler) return;
  const result = handler(el);
  if (result instanceof Promise) result.then(() => {});
  else render();
});

/* Press and hold a stepper to run the number up quickly. */
let holdTimer = null;
let holdRepeat = null;

function stopHold() {
  clearTimeout(holdTimer);
  clearInterval(holdRepeat);
  holdTimer = holdRepeat = null;
}

document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('[data-act="step"]');
  if (!el || el.disabled) return;
  const { group, field } = el.dataset;
  const step = Number(el.dataset.step);
  holdTimer = setTimeout(() => {
    holdRepeat = setInterval(() => {
      if (applyStep(group, field, step)) render();
      else stopHold();
    }, 80);
  }, 400);
});

for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(evt, stopHold);
}

/* Steppers repeat on hold; a stray double-tap shouldn't zoom the page. */
document.addEventListener('dblclick', (e) => e.preventDefault());

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

render();
