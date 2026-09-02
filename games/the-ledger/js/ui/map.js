/**
 * The Ledger — the map: title, the country, a town, and a book briefing.
 */
import { store, render, loadSave, clearSave, bestScore } from '../store.js';
import * as C from '../campaign.js';
import * as S from '../sim.js';
import { newOps } from '../ops.js';
import { startBook } from './run.js';
import { money, whole, pct, fact, tierPill, bar, backBar } from './kit.js';
import * as Entitlements from '../payments/client/entitlements.js';
import { paywallScreen, paywallActions, resetPaywall } from '../payments/client/paywall.js';
import { PAYMENTS } from '../payments.config.js';

/** Towns this build lets the player into without paying. */
const freeTowns = () => Entitlements.freeTier('the-ledger').towns ?? C.TOWNS.length;
const townPaidFor = (townId) =>
  Entitlements.owns('the-ledger') || C.isTownFree(townId, freeTowns());

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

function title() {
  const saved = loadSave();
  const best = bestScore();
  return {
    body: `
      <div class="hero">
        <div class="hero-icon">📒</div>
        <h1 class="hero-title">The Ledger</h1>
        <p class="hero-sub">Twenty-five towns. Twenty-five books each.<br />
        They ask, you answer, and you find out months later.</p>
        ${best ? `<p class="muted">Best career: ${best.toLocaleString('en-US')} loans written</p>` : ''}
      </div>
    `,
    actions: `
      ${saved ? `<button class="btn primary" data-act="continueGame">Continue</button>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" data-act="newCampaign">${saved ? 'New career' : 'Start a career'}</button>
      <button class="btn" data-act="freePlay">Free book</button>
      ${Entitlements.configured() && !Entitlements.owns('the-ledger')
        ? `<button class="btn ghost" data-act="openShop">Unlock the full campaign</button>` : ''}
      <button class="btn ghost" data-act="openHelp">How to play</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The country
 * ------------------------------------------------------------------ */

function world() {
  const campaign = store.campaign;
  const progress = C.campaignProgress(campaign);

  const rows = C.TOWNS.map((town) => {
    const reached = C.isTownUnlocked(campaign, town.id);
    const paid = townPaidFor(town.id);
    const held = C.heldIn(campaign, town.id).length;
    const done = C.townDone(campaign, town.id);

    if (reached && !paid) {
      return `
        <button class="tile" data-act="openShop" data-town="${town.id}">
          <span class="tile-flag">🔓</span>
          <span class="tile-main">
            <span class="tile-name">${town.name}</span>
            <span class="tile-sub">${town.challenge.name} — unlock to play</span>
          </span>
          <span class="tile-meter"><span class="tile-count">Buy</span></span>
        </button>`;
    }
    return `
      <button class="tile ${reached ? '' : 'locked'} ${done ? 'done' : ''}"
              data-act="${reached ? 'openTown' : ''}" data-town="${town.id}"
              ${reached ? '' : 'disabled'}>
        <span class="tile-flag">${reached ? town.icon : '🔒'}</span>
        <span class="tile-main">
          <span class="tile-name">${town.name}${done ? ' ✓' : ''}</span>
          <span class="tile-sub">${reached ? town.challenge.name : 'Locked'}</span>
        </span>
        <span class="tile-meter">
          <span class="tile-count">${held}/${C.BOOKS_PER_TOWN}</span>
          ${bar(held / C.BOOKS_PER_TOWN, done ? 'bar-win' : '')}
        </span>
      </button>`;
  }).join('');

  const gated = Entitlements.configured() && !Entitlements.owns('the-ledger');

  return {
    body: `
      <h1 class="title">The country</h1>
      <p class="sub">${progress.books} books held · ${progress.towns}/${progress.totalTowns} towns finished</p>
      ${C.opsUnlocked(campaign) ? `<button class="btn wide" data-act="openOps">🏛️ The network</button>` : ''}
      ${store.ui.opsReport ? networkFlash(store.ui.opsReport) : ''}
      <div class="tiles">${rows}</div>
      ${gated ? `<button class="btn wide primary" data-act="openShop">Unlock all ${C.TOWNS.length} towns</button>` : ''}
      <button class="btn ghost wide" data-act="openHelp">How to play</button>
      <button class="btn ghost wide danger" data-act="wipeSave">Delete this career</button>
    `,
  };
}

function networkFlash(report) {
  store.ui.opsReport = null;
  if (!report) return '';
  return `<div class="notice">While you were out, the branches wrote ${report.loans} loans over ${report.days} days:
    ${money(report.net)} after wages.
    ${report.suspended.length ? `<strong>${report.suspended.length} branch had to suspend payment.</strong>` : ''}</div>`;
}

/* ------------------------------------------------------------------ *
 * A town
 * ------------------------------------------------------------------ */

function town() {
  const campaign = store.campaign;
  const townId = store.ui.townId;
  const t = C.getTown(townId);
  const books = C.booksFor(townId);
  const held = C.heldIn(campaign, townId);

  const rows = books.map((book) => {
    const unlocked = C.isBookUnlocked(campaign, townId, book.index);
    const isHeld = held.includes(book.index);
    return `
      <button class="tile ${unlocked ? '' : 'locked'} ${isHeld ? 'done' : ''}"
              data-act="${unlocked ? 'openBook' : ''}" data-index="${book.index}"
              ${unlocked ? '' : 'disabled'}>
        <span class="tile-flag">${isHeld ? '✅' : unlocked ? C.TIERS[book.tier].icon : '🔒'}</span>
        <span class="tile-main">
          <span class="tile-name">${unlocked ? book.name : `Book ${book.index + 1}`}</span>
          <span class="tile-sub">${unlocked ? (book.quirk || C.TIERS[book.tier].label) : 'Locked'}</span>
        </span>
        <span class="tile-meter"><span class="tile-count">${book.index + 1}</span></span>
      </button>`;
  }).join('');

  return {
    body: `
      ${backBar('The country', 'backWorld')}
      <h1 class="title">${t.icon} ${t.name}</h1>
      <p class="sub">${t.county} · ${held.length}/${C.BOOKS_PER_TOWN} books held</p>
      <section class="card">
        <h2 class="card-title">${t.challenge.name}</h2>
        <p class="muted">${t.challenge.blurb}</p>
      </section>
      <div class="tiles">${rows}</div>
    `,
  };
}

/* ------------------------------------------------------------------ *
 * A book briefing
 * ------------------------------------------------------------------ */

function bookScreen() {
  const campaign = store.campaign;
  const townId = store.ui.townId;
  const index = store.ui.bookIndex;
  const t = C.getTown(townId);
  const book = C.booksFor(townId)[index];
  const tier = C.TIERS[book.tier];
  const config = C.runConfigFor(townId, index);
  const target = C.targetFor(campaign, townId, index);
  const held = C.isHeld(campaign, townId, index);
  const notes = C.describeMods(config.mods);

  // Peek at the book without starting it, so the numbers on the briefing are real.
  const preview = S.newRun({ ...config, target: null });
  const files = preview.applications.reduce((n, b) => n + b.length, 0);

  return {
    body: `
      ${backBar(t.name, 'backTown')}
      <h1 class="title">${book.name}</h1>
      <p class="sub">${tierPill(book.tier)} ${book.quirk ? `· ${book.quirk}` : ''}</p>

      <section class="facts">
        ${fact('Weeks', config.weeks)}
        ${fact('Your capital', whole(config.stake))}
        ${fact('Deposits', whole(preview.deposits))}
        ${fact('Target', whole(target), 'good')}
      </section>

      <section class="card">
        <h2 class="card-title">What you are taking on</h2>
        <p class="muted small">About ${files} people will come to the desk over the ${config.weeks} weeks.
        You are lending ${whole(preview.cash)} — most of it other people's.</p>
        ${notes.length
          ? `<ul class="mods">${notes.map((n) => `<li><span>${n.icon}</span>${n.text}</li>`).join('')}</ul>`
          : `<p class="muted">An ordinary book. Nothing stacked either way.</p>`}
        <p class="muted small">${tier.blurb}</p>
      </section>

      <section class="card">
        <p class="muted small">The target is ${Math.round(tier.parFactor * 100)}% of what the best reference
        underwriter clears on this exact book — not a number someone guessed. The applicants and
        what becomes of them are fixed by the seed, so a book you lose is a puzzle you can learn.</p>
      </section>
    `,
    actions: held
      ? `<button class="btn" data-act="startRun">Work it again</button>`
      : `<button class="btn primary" data-act="startRun">Take the book</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Help
 * ------------------------------------------------------------------ */

function help() {
  return {
    body: `
      ${backBar('Back', 'backFromHelp')}
      <h1 class="title">How to play</h1>

      <section class="card">
        <h2 class="card-title">The desk</h2>
        <p>People come to borrow money, <strong>one at a time</strong>. You approve or you decline,
        and you cannot take it back. You never see who is behind them in the queue, so you cannot
        wait and pick the best of the week — you have to decide what a good loan looks like and
        hold to it.</p>
      </section>

      <section class="card">
        <h2 class="card-title">What is hidden</h2>
        <p>Whether they will actually pay you back. That is never printed. You get four readings
        on it, all of them noisy:</p>
        <ul class="mods">
          <li><span>📚</span>The books they keep.</li>
          <li><span>🤝</span>How long they have been about, and who will vouch.</li>
          <li><span>💬</span>What the clerk made of them.</li>
          <li><span>%</span>The rate. That one is the <em>town's</em> opinion, not yours —
            and the town is a worse judge than a careful reader of the other three.</li>
        </ul>
        <p>A fat rate on a file that reads well is where the money in this game is.</p>
      </section>

      <section class="card">
        <h2 class="card-title">You find out late</h2>
        <p>A loan written in March goes bad in July. You are always judging with an out-of-date
        sense of how good your judgement has been. The only report you get is what people say
        about your book — never a number.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Two ways to die</h2>
        <p><strong>Bad lending</strong> eats your capital until there is none, and the examiner
        closes you.</p>
        <p><strong>Too much good lending</strong> is a different mistake. Deposits can be
        withdrawn whenever the town likes; loans cannot be called in. Lend out what you were
        holding against a bad week and a perfectly sound bank still dies when people queue up
        for their money.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Confidence</h2>
        <p>It decides whether money flows in or out. It rises a little each quiet week and
        <strong>collapses the moment you cannot pay somebody</strong>. Nothing you can buy
        brings it back faster.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Scoring</h2>
        <p>You are scored on the <strong>capital you built over the year</strong> — cash, plus
        what is owed to you, less what you owe. The target is a share of what the best reference
        underwriter clears on that exact book, so no book asks for more than it can give.</p>
      </section>

      <section class="card">
        <h2 class="card-title">The network</h2>
        <p>Hold five towns and you can stop doing it all yourself: open branches, ship cash out
        to them, and put standing managers on books you already hold. A branch's
        <strong>standing</strong> is the one thing the vault cannot hold — it climbs a little
        each day, and the morning a branch cannot pay somebody it is gone entirely.</p>
      </section>
    `,
  };
}

function shop() {
  return paywallScreen({ game: PAYMENTS.game, gameName: PAYMENTS.gameName });
}

export const screens = { title, world, town, book: bookScreen, help, shop };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

const shopActions = paywallActions({
  rerender: render,
  close: () => {
    resetPaywall();
    store.ui.view = store.ui.shopFrom || (store.campaign ? 'world' : 'title');
  },
});

export const actions = {
  ...shopActions,

  openShop() {
    resetPaywall();
    store.ui.shopFrom = store.ui.view === 'shop' ? store.ui.shopFrom : store.ui.view;
    store.ui.view = 'shop';
  },

  newCampaign() {
    clearSave();
    store.campaign = C.newCampaign();
    store.run = null;
    store.ui.view = 'world';
  },

  continueGame() {
    const data = loadSave();
    if (!data) return;
    store.campaign = data.campaign;
    store.run = data.run;
    if (store.campaign.ops === undefined) store.campaign.ops = null;
    store.ui.townId = data.townId ?? null;
    store.ui.bookIndex = data.bookIndex ?? null;
    store.ui.view = data.run ? 'run' : (data.view ?? 'world');
  },

  freePlay() {
    store.campaign = store.campaign || C.newCampaign();
    store.run = S.newRun({ weeks: 20 });
    store.ui.pending = null;
    store.ui.lastDecision = null;
    store.ui.view = 'run';
  },

  openTown(el) {
    const townId = el.dataset.town;
    if (!townPaidFor(townId)) return actions.openShop();
    store.ui.townId = townId;
    store.ui.view = 'town';
  },

  openBook(el) {
    store.ui.bookIndex = Number(el.dataset.index);
    store.ui.view = 'book';
  },

  startRun() { startBook(store.ui.townId, store.ui.bookIndex); },

  backWorld() { store.ui.view = 'world'; },
  backTown() { store.ui.view = 'town'; },

  openHelp() {
    store.ui.helpFrom = store.ui.view;
    store.ui.view = 'help';
  },
  backFromHelp() {
    store.ui.view = store.ui.helpFrom === 'title' || !store.campaign ? 'title' : 'world';
  },

  openOps() {
    if (!store.campaign.ops) store.campaign.ops = newOps();
    store.ui.view = 'ops';
  },

  wipeSave() {
    clearSave();
    store.campaign = null;
    store.run = null;
    store.ui.view = 'title';
  },
};
