/**
 * The Forge — the map: title, the world, a city, and a workshop briefing.
 */
import { store, render, loadSave, clearSave, bestScore } from '../store.js';
import * as C from '../campaign.js';
import * as S from '../sim.js';
import { newGuild } from '../ops.js';
import { startWorkshop } from './run.js';
import { money, count, fact, tierPill, bar, backBar } from './kit.js';
import * as Entitlements from '../payments/client/entitlements.js';
import { paywallScreen, paywallActions, resetPaywall } from '../payments/client/paywall.js';
import { PAYMENTS } from '../payments.config.js';

/** Cities this build lets the player into without paying. */
const freeCities = () => Entitlements.freeTier('the-forge').regions ?? C.CITIES.length;
const cityPaidFor = (cityId) =>
  Entitlements.owns('the-forge') || C.isCityFree(cityId, freeCities());

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

function title() {
  const saved = loadSave();
  const best = bestScore();
  return {
    body: `
      <div class="hero">
        <div class="hero-icon">🔨</div>
        <h1 class="hero-title">The Forge</h1>
        <p class="hero-sub">Twenty-five cities. Twenty-five workshops each.<br />
        Find the heat the metal wants, and swing until the commission is filled.</p>
        ${best ? `<p class="muted">Best campaign: ${count(best)} pieces made</p>` : ''}
      </div>
    `,
    actions: `
      ${saved ? `<button class="btn primary" data-act="continueGame">Continue</button>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" data-act="newCampaign">${saved ? 'New campaign' : 'Start a campaign'}</button>
      <button class="btn" data-act="freePlay">Open bench</button>
      <button class="btn ghost" data-act="open-bonus-shop">🎬 Bonus Shop</button>
      ${Entitlements.configured() && !Entitlements.owns('the-forge')
        ? `<button class="btn ghost" data-act="openShop">Unlock the full campaign</button>` : ''}
      <button class="btn ghost" data-act="openHelp">How to play</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The world
 * ------------------------------------------------------------------ */

function world() {
  const campaign = store.campaign;
  const progress = C.campaignProgress(campaign);

  const rows = C.CITIES.map((city) => {
    const reached = C.isCityUnlocked(campaign, city.id);
    const paid = cityPaidFor(city.id);
    const held = C.heldIn(campaign, city.id).length;
    const done = C.cityDone(campaign, city.id);

    // Three states: not reached yet, reached but not bought, and open.
    if (reached && !paid) {
      return `
        <button class="tile" data-act="openShop" data-city="${city.id}">
          <span class="tile-flag">🔓</span>
          <span class="tile-main">
            <span class="tile-name">${city.name}</span>
            <span class="tile-sub">${city.challenge.name} — unlock to play</span>
          </span>
          <span class="tile-meter"><span class="tile-count">Buy</span></span>
        </button>`;
    }
    return `
      <button class="tile ${reached ? '' : 'locked'} ${done ? 'done' : ''}"
              data-act="${reached ? 'openCity' : ''}" data-city="${city.id}"
              ${reached ? '' : 'disabled'}>
        <span class="tile-flag">${reached ? city.flag : '🔒'}</span>
        <span class="tile-main">
          <span class="tile-name">${city.name}${done ? ' ✓' : ''}</span>
          <span class="tile-sub">${reached ? city.challenge.name : 'Locked'}</span>
        </span>
        <span class="tile-meter">
          <span class="tile-count">${held}/${C.WORKSHOPS_PER_CITY}</span>
          ${bar(held / C.WORKSHOPS_PER_CITY, done ? 'bar-win' : '')}
        </span>
      </button>`;
  }).join('');

  const gated = Entitlements.configured() && !Entitlements.owns('the-forge');

  return {
    body: `
      <h1 class="title">The trade</h1>
      <p class="sub">${progress.workshops} workshops held · ${progress.cities}/${progress.totalCities} cities clear</p>
      ${C.guildUnlocked(campaign) ? `<button class="btn wide" data-act="openGuild">⚒️ The guild</button>` : ''}
      ${store.ui.guildReport ? guildFlash(store.ui.guildReport) : ''}
      <div class="tiles">${rows}</div>
      ${gated ? `<button class="btn wide primary" data-act="openShop">Unlock all ${C.CITIES.length} cities</button>` : ''}
      <button class="btn ghost wide" data-act="openHelp">How to play</button>
      <button class="btn ghost wide danger" data-act="wipeSave">Delete this campaign</button>
    `,
  };
}

function guildFlash(report) {
  store.ui.guildReport = null;
  if (!report) return '';
  return `<div class="notice">The guild worked ${report.shifts} shifts: ${count(report.pieces)} pieces, ${money(report.net)} net.
    ${report.dry.length ? `<strong>${report.dry.length} depot out of bar stock.</strong>` : ''}</div>`;
}

/* ------------------------------------------------------------------ *
 * A city
 * ------------------------------------------------------------------ */

function city() {
  const campaign = store.campaign;
  const cityId = store.ui.cityId;
  const cy = C.getCity(cityId);
  const workshops = C.workshopsFor(cityId);
  const held = C.heldIn(campaign, cityId);

  const rows = workshops.map((w) => {
    const unlocked = C.isWorkshopUnlocked(campaign, cityId, w.index);
    const isHeld = held.includes(w.index);
    return `
      <button class="tile ${unlocked ? '' : 'locked'} ${isHeld ? 'done' : ''}"
              data-act="${unlocked ? 'openWorkshop' : ''}" data-index="${w.index}"
              ${unlocked ? '' : 'disabled'}>
        <span class="tile-flag">${isHeld ? '✅' : unlocked ? C.TIERS[w.tier].icon : '🔒'}</span>
        <span class="tile-main">
          <span class="tile-name">${unlocked ? w.name : `Workshop ${w.index + 1}`}</span>
          <span class="tile-sub">${unlocked ? (w.quirk || C.TIERS[w.tier].label) : 'Locked'}</span>
        </span>
        <span class="tile-meter"><span class="tile-count">${w.index + 1}</span></span>
      </button>`;
  }).join('');

  return {
    body: `
      ${backBar('The trade', 'backWorld')}
      <h1 class="title">${cy.flag} ${cy.name}</h1>
      <p class="sub">${cy.country} · ${held.length}/${C.WORKSHOPS_PER_CITY} held</p>
      <section class="card">
        <h2 class="card-title">${cy.challenge.name}</h2>
        <p class="muted">${cy.challenge.blurb}</p>
      </section>
      <div class="tiles">${rows}</div>
    `,
  };
}

/* ------------------------------------------------------------------ *
 * A workshop briefing
 * ------------------------------------------------------------------ */

function workshop() {
  const campaign = store.campaign;
  const cityId = store.ui.cityId;
  const index = store.ui.workshopIndex;
  const cy = C.getCity(cityId);
  const w = C.workshopsFor(cityId)[index];
  const tier = C.TIERS[w.tier];
  const config = C.runConfigFor(cityId, index);
  const target = C.targetFor(campaign, cityId, index);
  const alloy = S.ALLOY_INDEX[w.alloyId];
  const held = C.isHeld(campaign, cityId, index);
  const notes = C.describeMods(config.mods);
  const mods = S.withMods(config.mods);

  return {
    body: `
      ${backBar(cy.name, 'backCity')}
      <h1 class="title">${w.name}</h1>
      <p class="sub">${tierPill(w.tier)} ${w.quirk ? `· ${w.quirk}` : ''}</p>

      <section class="card alloy">
        <div class="alloy-head">
          <span class="alloy-icon">${alloy.icon}</span>
          <div>
            <div class="alloy-name">${alloy.name}</div>
            <div class="alloy-note">${alloy.swings[0]}–${alloy.swings[1]} swings to the piece</div>
          </div>
        </div>
        <p class="muted">${alloy.blurb}</p>
      </section>

      <section class="facts">
        ${fact('Shifts', config.shifts)}
        ${fact('Purse', money(config.purse * mods.funding * mods.shopScale))}
        ${fact('Retainer', money(config.retainer * mods.funding * mods.shopScale))}
        ${fact('Pieces wanted', count(target), 'good')}
      </section>

      <section class="card">
        <h2 class="card-title">What you are walking into</h2>
        ${notes.length
          ? `<ul class="mods">${notes.map((n) => `<li><span>${n.icon}</span>${n.text}</li>`).join('')}</ul>`
          : `<p class="muted">An ordinary shop. Nothing stacked either way.</p>`}
        <p class="muted small">${tier.blurb}</p>
      </section>

      <section class="card">
        <p class="muted small">The commission is ${Math.round(tier.parFactor * 100)}% of what the best reference
        smith delivers at this exact shop — not a number someone guessed. The shifts never change and the
        metal never changes, so a commission you lose is a puzzle you can learn.</p>
      </section>
    `,
    actions: held
      ? `<button class="btn" data-act="startRun">Work it again</button>`
      : `<button class="btn primary" data-act="startRun">Take the commission</button>`,
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
        <h2 class="card-title">The shift</h2>
        <p>Every commission is worked a shift at a time. You read the foreman, set four
        levers at the bench, then stand at the anvil and swing — every tap is one blow of
        your own hammer, up to what one pair of arms has in it. Then eight hours run.</p>
      </section>

      <section class="card">
        <h2 class="card-title">The four levers</h2>
        <ul class="mods">
          <li><span>🔥</span><strong>The bellows</strong> — ten notches, and exactly one of
          them is right for the metal on the bench. Nothing anywhere tells you which.</li>
          <li><span>🧑‍🏭</span><strong>Apprentices</strong> — hands that swing all shift and
          want paying whether the work is any good or not.</li>
          <li><span>🛠️</span><strong>Die sets</strong> — tooling multiplies everything the
          shop makes. It arrives a shift late, it has to be kept true, and a share of the
          rack goes past truing every shift.</li>
          <li><span>⏱️</span><strong>The pace</strong> — the only free lever, and the most
          expensive. It buys swings with morale and pays for them in scrap.</li>
        </ul>
      </section>

      <section class="card">
        <h2 class="card-title">The metal is hidden</h2>
        <p>Every alloy has a heat it wants and a window either side of it, and neither is
        ever printed. You can see what colour your fire is running; what you cannot see is
        what colour this metal needs. The foreman is how you find out — dull and cracking
        means cold, sparking and crumbling means burnt.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Heat is never banked</h2>
        <p>The fire dies overnight. Every shift starts at the same dull glow, in every
        workshop, however rich you are — and every hammer on the metal drags the fire back
        down while you work. It is the one thing in this game money cannot buy ahead.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Scoring</h2>
        <p>You are scored on <strong>pieces delivered</strong>. The commission is a share of
        what the best reference smith manages at that exact workshop, so no shop can ask for
        more than it can actually give.</p>
      </section>

      <section class="card">
        <h2 class="card-title">The guild</h2>
        <p>Hold five cities and you can stop working shop by shop: open depots, buy bar
        stock by the ton, and station journeymen on workshops you already hold. Your own
        hands are the one thing a journeyman never has, which is why the guild can never
        quite match you.</p>
      </section>
    `,
  };
}

function shop() {
  return paywallScreen({ game: PAYMENTS.game, gameName: PAYMENTS.gameName });
}

export const screens = { title, world, city, workshop, help, shop };

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
    if (store.campaign.guild === undefined) store.campaign.guild = null;
    store.ui.cityId = data.cityId ?? null;
    store.ui.workshopIndex = data.workshopIndex ?? null;
    store.ui.view = data.run ? 'run' : (data.view ?? 'world');
    // Targets are measured, so a change to the model makes the cached ones
    // wrong. Say so rather than letting a bar quietly differ from last time.
    if (data.migrated?.cleared > 0) {
      store.ui.notice = `The model has changed since you last played. `
        + `${data.migrated.cleared} ${data.migrated.cleared === 1 ? 'commission has' : 'commissions have'} `
        + `been measured again. A workshop you are part-way through keeps the commission it started on.`;
    }
  },

  freePlay() {
    store.campaign = store.campaign || C.newCampaign();
    store.run = S.newRun({ seed: 20260906, shifts: 12, purse: 11, retainer: 2.4 });
    store.ui.pending = null;
    store.ui.view = 'run';
  },

  openCity(el) {
    const cityId = el.dataset.city;
    if (!cityPaidFor(cityId)) return actions.openShop();
    store.ui.cityId = cityId;
    store.ui.view = 'city';
  },

  openWorkshop(el) {
    store.ui.workshopIndex = Number(el.dataset.index);
    store.ui.view = 'workshop';
  },

  startRun() {
    startWorkshop(store.ui.cityId, store.ui.workshopIndex);
  },

  backWorld() { store.ui.view = 'world'; },
  backCity() { store.ui.view = 'city'; },

  openHelp() {
    store.ui.helpFrom = store.ui.view;
    store.ui.view = 'help';
  },
  backFromHelp() {
    store.ui.view = store.ui.helpFrom === 'title' || !store.campaign ? 'title' : 'world';
  },

  openGuild() {
    if (!store.campaign.guild) store.campaign.guild = newGuild();
    store.ui.view = 'guild';
  },

  wipeSave() {
    clearSave();
    store.campaign = null;
    store.run = null;
    store.ui.view = 'title';
  },
};
