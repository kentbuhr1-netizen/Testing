/**
 * Outbreak — the map: title, the world, a region, and a district briefing.
 */
import { store, render, loadSave, clearSave, bestScore } from '../store.js';
import * as C from '../campaign.js';
import * as S from '../sim.js';
import { newOps } from '../ops.js';
import { startDistrict } from './run.js';
import { money, lives, fact, tierPill, bar, backBar } from './kit.js';
import * as Entitlements from '../payments/client/entitlements.js';
import { paywallScreen, paywallActions, resetPaywall } from '../payments/client/paywall.js';
import { PAYMENTS } from '../payments.config.js';

/** Regions this build lets the player into without paying. */
const freeRegions = () => Entitlements.freeTier('outbreak').regions ?? C.REGIONS.length;
const regionPaidFor = (regionId) =>
  Entitlements.owns('outbreak') || C.isRegionFree(regionId, freeRegions());

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

function title() {
  const saved = loadSave();
  const best = bestScore();
  return {
    body: `
      <div class="hero">
        <div class="hero-icon">🦠</div>
        <h1 class="hero-title">Outbreak</h1>
        <p class="hero-sub">Twenty-five regions. Twenty-five districts each.<br />
        Read the pathogen, spend what you have, and save who you can.</p>
        ${best ? `<p class="muted">Best campaign: ${lives(best)} lives saved</p>` : ''}
      </div>
    `,
    actions: `
      ${saved ? `<button class="btn primary" data-act="continueGame">Continue</button>` : ''}
      <button class="btn ${saved ? '' : 'primary'}" data-act="newCampaign">${saved ? 'New campaign' : 'Start a campaign'}</button>
      <button class="btn" data-act="freePlay">Free response</button>
      <button class="btn ghost" data-act="open-bonus-shop">🎬 Bonus Shop</button>
      ${Entitlements.configured() && !Entitlements.owns('outbreak')
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

  const rows = C.REGIONS.map((region) => {
    const reached = C.isRegionUnlocked(campaign, region.id);
    const paid = regionPaidFor(region.id);
    const held = C.heldIn(campaign, region.id).length;
    const done = C.regionDone(campaign, region.id);

    // Three states: not reached yet, reached but not bought, and open.
    if (reached && !paid) {
      return `
        <button class="tile" data-act="openShop" data-region="${region.id}">
          <span class="tile-flag">🔓</span>
          <span class="tile-main">
            <span class="tile-name">${region.name}</span>
            <span class="tile-sub">${region.challenge.name} — unlock to play</span>
          </span>
          <span class="tile-meter"><span class="tile-count">Buy</span></span>
        </button>`;
    }
    return `
      <button class="tile ${reached ? '' : 'locked'} ${done ? 'done' : ''}"
              data-act="${reached ? 'openRegion' : ''}" data-region="${region.id}"
              ${reached ? '' : 'disabled'}>
        <span class="tile-flag">${reached ? region.flag : '🔒'}</span>
        <span class="tile-main">
          <span class="tile-name">${region.name}${done ? ' ✓' : ''}</span>
          <span class="tile-sub">${reached ? region.challenge.name : 'Locked'}</span>
        </span>
        <span class="tile-meter">
          <span class="tile-count">${held}/${C.DISTRICTS_PER_REGION}</span>
          ${bar(held / C.DISTRICTS_PER_REGION, done ? 'bar-win' : '')}
        </span>
      </button>`;
  }).join('');

  const gated = Entitlements.configured() && !Entitlements.owns('outbreak');

  return {
    body: `
      <h1 class="title">The world</h1>
      <p class="sub">${progress.districts} districts held · ${progress.regions}/${progress.totalRegions} regions clear</p>
      ${C.opsUnlocked(campaign) ? `<button class="btn wide" data-act="openOps">🏛️ The agency</button>` : ''}
      ${store.ui.opsReport ? agencyFlash(store.ui.opsReport) : ''}
      <div class="tiles">${rows}</div>
      ${gated ? `<button class="btn wide primary" data-act="openShop">Unlock all ${C.REGIONS.length} regions</button>` : ''}
      <button class="btn ghost wide" data-act="openHelp">How to play</button>
      <button class="btn ghost wide danger" data-act="wipeSave">Delete this campaign</button>
    `,
  };
}

function agencyFlash(report) {
  store.ui.opsReport = null;
  if (!report) return '';
  return `<div class="notice">The agency ran ${report.weeks} weeks: ${lives(report.saved)} lives, ${money(report.net)} net.
    ${report.dry.length ? `<strong>${report.dry.length} laboratory out of doses.</strong>` : ''}</div>`;
}

/* ------------------------------------------------------------------ *
 * A region
 * ------------------------------------------------------------------ */

function region() {
  const campaign = store.campaign;
  const regionId = store.ui.regionId;
  const rg = C.getRegion(regionId);
  const districts = C.districtsFor(regionId);
  const held = C.heldIn(campaign, regionId);

  const rows = districts.map((d) => {
    const unlocked = C.isDistrictUnlocked(campaign, regionId, d.index);
    const isHeld = held.includes(d.index);
    return `
      <button class="tile ${unlocked ? '' : 'locked'} ${isHeld ? 'done' : ''}"
              data-act="${unlocked ? 'openDistrict' : ''}" data-index="${d.index}"
              ${unlocked ? '' : 'disabled'}>
        <span class="tile-flag">${isHeld ? '✅' : unlocked ? C.TIERS[d.tier].icon : '🔒'}</span>
        <span class="tile-main">
          <span class="tile-name">${unlocked ? d.name : `District ${d.index + 1}`}</span>
          <span class="tile-sub">${unlocked ? (d.quirk || C.TIERS[d.tier].label) : 'Locked'}</span>
        </span>
        <span class="tile-meter"><span class="tile-count">${d.index + 1}</span></span>
      </button>`;
  }).join('');

  return {
    body: `
      ${backBar('The world', 'backWorld')}
      <h1 class="title">${rg.flag} ${rg.name}</h1>
      <p class="sub">${rg.country} · ${held.length}/${C.DISTRICTS_PER_REGION} held</p>
      <section class="card">
        <h2 class="card-title">${rg.challenge.name}</h2>
        <p class="muted">${rg.challenge.blurb}</p>
      </section>
      <div class="tiles">${rows}</div>
    `,
  };
}

/* ------------------------------------------------------------------ *
 * A district briefing
 * ------------------------------------------------------------------ */

function district() {
  const campaign = store.campaign;
  const regionId = store.ui.regionId;
  const index = store.ui.districtIndex;
  const rg = C.getRegion(regionId);
  const d = C.districtsFor(regionId)[index];
  const tier = C.TIERS[d.tier];
  const config = C.runConfigFor(regionId, index);
  const target = C.targetFor(campaign, regionId, index);
  const pathogen = S.PATHOGEN_INDEX[d.pathogenId];
  const held = C.isHeld(campaign, regionId, index);
  const notes = C.describeMods(config.mods);
  const pop = Math.round(S.BASE_POP * (config.mods.popScale ?? 1));

  return {
    body: `
      ${backBar(rg.name, 'backRegion')}
      <h1 class="title">${d.name}</h1>
      <p class="sub">${tierPill(d.tier)} ${d.quirk ? `· ${d.quirk}` : ''}</p>

      <section class="card pathogen">
        <div class="pathogen-head">
          <span class="pathogen-icon">${pathogen.icon}</span>
          <div>
            <div class="pathogen-name">${pathogen.name}</div>
            <div class="pathogen-r0">R₀ between ${pathogen.r0[0]} and ${pathogen.r0[1]}</div>
          </div>
        </div>
        <p class="muted">${pathogen.blurb}</p>
      </section>

      <section class="facts">
        ${fact('Population', lives(pop))}
        ${fact('Weeks', config.weeks)}
        ${fact('Starting budget', money(config.funds * (pop / S.REF_POP)))}
        ${fact('Lives to save', lives(target), 'good')}
      </section>

      <section class="card">
        <h2 class="card-title">What you are walking into</h2>
        ${notes.length
          ? `<ul class="mods">${notes.map((n) => `<li><span>${n.icon}</span>${n.text}</li>`).join('')}</ul>`
          : `<p class="muted">An ordinary district. Nothing stacked either way.</p>`}
        <p class="muted small">${tier.blurb}</p>
      </section>

      <section class="card">
        <p class="muted small">The target is ${Math.round(tier.parFactor * 100)}% of what the best reference
        response achieves on this exact district — not a number someone guessed. The weeks never
        change, so a district you lose is a puzzle you can learn.</p>
      </section>
    `,
    actions: held
      ? `<button class="btn" data-act="startRun">Play it again</button>`
      : `<button class="btn primary" data-act="startRun">Take the district</button>`,
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
        <h2 class="card-title">The week</h2>
        <p>Every district is played a week at a time. You read the surveillance
        briefing, set four levers, and watch seven days run.</p>
      </section>

      <section class="card">
        <h2 class="card-title">The four levers</h2>
        <ul class="mods">
          <li><span>🔬</span><strong>Test &amp; trace</strong> — strong early, useless once
          the labs are swamped. Watch the reach figure.</li>
          <li><span>🚧</span><strong>Distancing</strong> — the only free lever, and the most
          expensive. It starves the budget that pays for everything else, and it burns
          public patience, which is the only thing that makes it work.</li>
          <li><span>💉</span><strong>Vaccination</strong> — takes weeks to land, so it is
          worthless if you start it late and decisive if you start it early.</li>
          <li><span>🏥</span><strong>Hospital beds</strong> — changes nothing about the
          spread and everything about the dying. Beds open a week after you fund them.</li>
        </ul>
      </section>

      <section class="card">
        <h2 class="card-title">The pathogen is hidden</h2>
        <p>How traceable it is, and how much it cares about closing indoor spaces, are
        never printed. The weekly surveillance notes are how you find out — a lever that
        is doing nothing will tell you so.</p>
      </section>

      <section class="card">
        <h2 class="card-title">Scoring</h2>
        <p>You are scored on <strong>lives saved</strong> — the gap between the deaths a
        do-nothing response produces and the deaths you produce. The target is a share of
        what the best reference response achieves on that exact district, so no district
        can ask for more than it can actually give.</p>
      </section>

      <section class="card">
        <h2 class="card-title">The agency</h2>
        <p>Hold five regions and you can stop working district by district: build
        laboratories, buy doses in bulk, and station standing teams on districts you
        already hold. Beds are never stockpiled — a bed is a building — so teams fund
        theirs locally.</p>
      </section>
    `,
  };
}

function shop() {
  return paywallScreen({ game: PAYMENTS.game, gameName: PAYMENTS.gameName });
}

export const screens = { title, world, region, district, help, shop };

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
    store.ui.regionId = data.regionId ?? null;
    store.ui.districtIndex = data.districtIndex ?? null;
    store.ui.view = data.run ? 'run' : (data.view ?? 'world');
  },

  freePlay() {
    store.campaign = store.campaign || C.newCampaign();
    store.run = S.newRun({ weeks: 14, funds: 11, baseFunds: 7 });
    store.ui.pending = null;
    store.ui.view = 'run';
  },

  openRegion(el) {
    const regionId = el.dataset.region;
    if (!regionPaidFor(regionId)) return actions.openShop();
    store.ui.regionId = regionId;
    store.ui.view = 'region';
  },

  openDistrict(el) {
    store.ui.districtIndex = Number(el.dataset.index);
    store.ui.view = 'district';
  },

  startRun() {
    startDistrict(store.ui.regionId, store.ui.districtIndex);
  },

  backWorld() { store.ui.view = 'world'; },
  backRegion() { store.ui.view = 'region'; },

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
