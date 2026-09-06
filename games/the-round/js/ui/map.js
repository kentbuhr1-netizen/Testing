/**
 * The Round — the map: title, the country, a town, and a round briefing.
 */
import { store, render, loadSave, clearSave, bestScore } from '../store.js';
import * as C from '../campaign.js';
import * as S from '../sim.js';
import { newOps } from '../ops.js';
import { startRound } from './run.js';
import { money, whole, fact, tierPill, bar, backBar, clock, roundMap } from './kit.js';
import * as Entitlements from '../payments/client/entitlements.js';
import { paywallScreen, paywallActions, resetPaywall } from '../payments/client/paywall.js';
import { PAYMENTS } from '../payments.config.js';

/** Towns this build lets the player into without paying. */
const freeTowns = () => Entitlements.freeTier('the-round').towns ?? C.TOWNS.length;
const townPaidFor = (townId) =>
  Entitlements.owns('the-round') || C.isTownFree(townId, freeTowns());

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

function title() {
  const saved = loadSave();
  const best = bestScore();
  return {
    body: `
      <div class="hero">
        <div class="hero-icon">🌱</div>
        <h1 class="hero-title">The Round</h1>
        <p class="hero-sub">Twenty-five towns. Twenty-five rounds each.<br />
        Plan the day, beat the weather, and get home before dark.</p>
        ${best ? `<p class="muted">Best career: ${best.toLocaleString('en-US')} lawns cut</p>` : ''}
      </div>
    `,
    actions: `
      ${saved ? `<button class="btn primary" data-act="continueGame">Continue</button>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" data-act="newCampaign">${saved ? 'New career' : 'Start a career'}</button>
      <button class="btn" data-act="freePlay">Free season</button>
      <button class="btn ghost" data-act="open-bonus-shop">🎬 Bonus Shop</button>
      ${Entitlements.configured() && !Entitlements.owns('the-round')
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
          <span class="tile-count">${held}/${C.ROUNDS_PER_TOWN}</span>
          ${bar(held / C.ROUNDS_PER_TOWN, done ? 'bar-win' : '')}
        </span>
      </button>`;
  }).join('');

  const gated = Entitlements.configured() && !Entitlements.owns('the-round');

  return {
    body: `
      <h1 class="title">The country</h1>
      <p class="sub">${progress.rounds} rounds held · ${progress.towns}/${progress.totalTowns} towns finished</p>
      ${C.opsUnlocked(campaign) ? `<button class="btn wide" data-act="openOps">🚚 The firm</button>` : ''}
      ${store.ui.opsReport ? firmFlash(store.ui.opsReport) : ''}
      <div class="tiles">${rows}</div>
      ${gated ? `<button class="btn wide primary" data-act="openShop">Unlock all ${C.TOWNS.length} towns</button>` : ''}
      <button class="btn ghost wide" data-act="openHelp">How to play</button>
      <button class="btn ghost wide danger" data-act="wipeSave">Delete this career</button>
    `,
  };
}

function firmFlash(report) {
  store.ui.opsReport = null;
  if (!report) return '';
  return `<div class="notice">While you were out, the firm cut ${report.lawns} lawns over ${report.days} days:
    ${money(report.net)} after wages.
    ${report.dry.length ? `<strong>${report.dry.length} yard ran empty.</strong>` : ''}</div>`;
}

/* ------------------------------------------------------------------ *
 * A town
 * ------------------------------------------------------------------ */

function town() {
  const campaign = store.campaign;
  const townId = store.ui.townId;
  const t = C.getTown(townId);
  const rounds = C.roundsFor(townId);
  const held = C.heldIn(campaign, townId);

  const rows = rounds.map((round) => {
    const unlocked = C.isRoundUnlocked(campaign, townId, round.index);
    const isHeld = held.includes(round.index);
    return `
      <button class="tile ${unlocked ? '' : 'locked'} ${isHeld ? 'done' : ''}"
              data-act="${unlocked ? 'openRound' : ''}" data-index="${round.index}"
              ${unlocked ? '' : 'disabled'}>
        <span class="tile-flag">${isHeld ? '✅' : unlocked ? C.TIERS[round.tier].icon : '🔒'}</span>
        <span class="tile-main">
          <span class="tile-name">${unlocked ? round.name : `Round ${round.index + 1}`}</span>
          <span class="tile-sub">${unlocked ? (round.quirk || C.TIERS[round.tier].label) : 'Locked'}</span>
        </span>
        <span class="tile-meter"><span class="tile-count">${round.index + 1}</span></span>
      </button>`;
  }).join('');

  return {
    body: `
      ${backBar('The country', 'backWorld')}
      <h1 class="title">${t.icon} ${t.name}</h1>
      <p class="sub">${t.county} · ${held.length}/${C.ROUNDS_PER_TOWN} rounds held</p>
      <section class="card">
        <h2 class="card-title">${t.challenge.name}</h2>
        <p class="muted">${t.challenge.blurb}</p>
      </section>
      <div class="tiles">${rows}</div>
    `,
  };
}

/* ------------------------------------------------------------------ *
 * A round briefing
 * ------------------------------------------------------------------ */

function round() {
  const campaign = store.campaign;
  const townId = store.ui.townId;
  const index = store.ui.roundIndex;
  const t = C.getTown(townId);
  const round = C.roundsFor(townId)[index];
  const tier = C.TIERS[round.tier];
  const config = C.runConfigFor(townId, index);
  const target = C.targetFor(campaign, townId, index);
  const held = C.isHeld(campaign, townId, index);
  const notes = C.describeMods(config.mods);

  // Peek at the round without starting it, so the map on the briefing is real.
  const preview = S.newRun({ ...config, target: null });

  return {
    body: `
      ${backBar(t.name, 'backTown')}
      <h1 class="title">${round.name}</h1>
      <p class="sub">${tierPill(round.tier)} ${round.quirk ? `· ${round.quirk}` : ''}</p>

      ${roundMap(preview.properties, [], { due: () => false })}

      <section class="facts">
        ${fact('Clients', preview.properties.length)}
        ${fact('Days', config.days)}
        ${fact('Float', money(config.stake))}
        ${fact('Target', whole(target), 'good')}
      </section>

      <section class="card">
        <h2 class="card-title">What you are taking on</h2>
        ${notes.length
          ? `<ul class="mods">${notes.map((n) => `<li><span>${n.icon}</span>${n.text}</li>`).join('')}</ul>`
          : `<p class="muted">An ordinary round. Nothing stacked either way.</p>`}
        <p class="muted small">${tier.blurb}</p>
      </section>

      <section class="card">
        <p class="muted small">The target is measured, not picked: two dozen seasons of ordinary play are
        played out on this exact round, and the bar is set among them. The first rounds of
        a town ask for about what a poor season makes; the last ask for better than any of
        them. The weather never changes, so a round you lose is a puzzle you can learn.</p>
      </section>
    `,
    actions: held
      ? `<button class="btn" data-act="startRun">Work it again</button>`
      : `<button class="btn primary" data-act="startRun">Take the round</button>`,
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
        <h2 class="card-title">The day</h2>
        <p>You have a round of client lawns and about ${clock(S.WORK_MINUTES)} of daylight — less
        when it rains. Tap lawns on the map, or in the list under it, in the order you will
        drive them. The van starts and ends at the yard, and every mile between stops is
        time you are not mowing.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Grass has to have grown</h2>
        <p>A visit only pays if there is something to cut. Turn up too early and you have
        spent an hour for nothing and mildly annoyed someone. Leave it too long and the
        lawn takes longer, the finish is worse, and they start looking for somebody else.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Taking your time</h2>
        <p>Any stop on the round can be given the extra time it needs — it costs
        ${Math.round((S.CARE_TIME - 1) * 100)}% longer on that lawn, and it shows in the finish.
        Fussy clients cannot be satisfied any other way: a sharp blade on a dry day is a
        decent cut, not a perfect one. Everybody else is a waste of your afternoon.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Your name</h2>
        <p>A round holds more lawns than you can cut, so losing one is no loss of work —
        it is a loss of standing. Every client who walks takes a slice off what your name
        is worth, and that comes off every lawn you cut for the rest of the season. Please
        people and it comes back, slowly.</p>
      </section>

      <section class="card">
        <h2 class="card-title">What is hidden</h2>
        <p>Every client has an interval they expect you at and a standard they expect —
        and <strong>neither is ever printed</strong>. You learn them from what people say
        after you have been:</p>
        <ul class="mods">
          <li><span>💬</span>“It was getting a bit shaggy.” — you left it too long.</li>
          <li><span>💬</span>“Looks like you were in a hurry.” — this one wanted more than
            a quick once-over. Take your time over it next visit.</li>
          <li><span>💬</span>“You could have been in and out.” — and this one never would
            have noticed. Those minutes bought you nothing.</li>
          <li><span>💬</span>“They came out to say it looks a picture.” — keep doing that.</li>
        </ul>
        <p>The patience bar beside each name is the only warning you get. At zero they
        cancel, and they do not come back.</p>
      </section>

      <section class="card">
        <h2 class="card-title">The blade</h2>
        <p>Sharpening costs ${clock(S.SHARPEN_MINUTES)} you could have spent mowing. A blunt one
        mows slower and leaves a finish that loses you contracts. That trade is the whole
        maintenance game.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Scoring</h2>
        <p>You are scored on <strong>profit over the season</strong>. The target is a share of
        what the best reference router clears on that exact round, so no round can ask for
        more than it can actually give.</p>
      </section>

      <section class="card">
        <h2 class="card-title">The firm</h2>
        <p>Hold five towns and you can stop doing it all yourself: open yards, buy fuel and
        blades by the pallet, and put standing crews on rounds you already hold.
        Daylight is the one thing a yard cannot stock — a crew that runs out of day cannot
        bank it — so a second crew, not a bigger order, is the only way to cut more grass.</p>
      </section>
    `,
  };
}

function shop() {
  return paywallScreen({ game: PAYMENTS.game, gameName: PAYMENTS.gameName });
}

export const screens = { title, world, town, round, help, shop };

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
    store.ui.roundIndex = data.roundIndex ?? null;
    store.ui.view = data.run ? 'run' : (data.view ?? 'world');
  },

  freePlay() {
    store.campaign = store.campaign || C.newCampaign();
    store.run = S.newRun({ days: 20 });
    store.ui.pending = null;
    store.ui.view = 'run';
  },

  openTown(el) {
    const townId = el.dataset.town;
    if (!townPaidFor(townId)) return actions.openShop();
    store.ui.townId = townId;
    store.ui.view = 'town';
  },

  openRound(el) {
    store.ui.roundIndex = Number(el.dataset.index);
    store.ui.view = 'round';
  },

  startRun() { startRound(store.ui.townId, store.ui.roundIndex); },

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
