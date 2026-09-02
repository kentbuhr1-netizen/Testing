/** Title, world map, city map and the corner briefing. */
import * as C from '../campaign.js';
import * as S from '../sim.js';
import { opsUnlocked } from '../campaign.js';
import { restockCost } from '../ops.js';
import * as E from '../employees.js';
import { store, save, loadSave, clearSave, bestScore, loadUnlockedAchievements, checkAchievements, achievementToast } from '../store.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { money, whole, fact, tierPill, bar, backBar } from './kit.js';

/* ------------------------------------------------------------------ *
 * Title
 * ------------------------------------------------------------------ */

function titleScreen() {
  const saved = loadSave();
  const progress = saved ? C.campaignProgress(saved.campaign) : null;
  const best = bestScore();
  const achievementCount = Object.keys(loadUnlockedAchievements()).length;
  const achievementTotal = Object.keys(ACHIEVEMENTS).length;
  return {
    body: `
      <div class="title-art">🍋</div>
      <div class="center">
        <h1>Lemonade Stand</h1>
        <p class="muted">${C.CITIES.length} cities. ${C.CORNERS_PER_CITY} corners apiece.<br />
        Start on one street corner and take the whole map.</p>
        ${progress ? `<p class="muted">Season so far: <strong>${progress.corners}</strong> corners,
          <strong>${progress.cities}</strong> cit${progress.cities === 1 ? 'y' : 'ies'} taken ·
          <strong>${whole(saved.campaign.treasury)}</strong> banked</p>` : ''}
        ${best && !progress ? `<p class="muted">Best free season: <strong>${money(best)}</strong></p>` : ''}
        <div class="chip-row" style="justify-content:center;margin-top:16px">
          <button class="chip" data-act="start-tutorial">🎓 Tutorial</button>
          <button class="chip" data-act="open-achievements">🏅 Achievements · ${achievementCount}/${achievementTotal}</button>
          <button class="chip" data-act="open-bonus-shop">🎬 Bonus Shop</button>
        </div>
      </div>`,
    actions: `
      ${saved ? '<button class="btn" data-act="continue">Continue</button>' : ''}
      <button class="${saved ? 'btn-ghost' : 'btn'}" data-act="new-campaign">
        ${saved ? 'New Campaign' : 'Start Campaign'}
      </button>
      <button class="btn-ghost" data-act="free-play">Free Play · 30 Days</button>
      <button class="btn-ghost" data-act="help">How to Play</button>`,
  };
}

function helpScreen() {
  return {
    body: `
      <h1>How to Play</h1>
      <div class="card">
        <h2>A day at the stand</h2>
        <p>Read the forecast, buy supplies, mix a pitcher, set a price, then open up. One pitcher pours ${S.CUPS_PER_PITCHER} cups.</p>
      </div>
      <div class="card">
        <h2>What matters</h2>
        <p><strong>Heat sells.</strong> A scorcher brings crowds and loosens wallets. Rain empties the street.</p>
        <p><strong>Taste is a secret recipe.</strong> One balance of lemons and sugar wins people over — customers only tell you when it is off. Hotter days want more ice.</p>
        <p><strong>Price is a trade.</strong> Charge more and fewer people buy. Reputation grows when the glass was worth the money.</p>
        <p><strong>Ice melts overnight.</strong> Lemons, sugar and cups keep. Ice does not.</p>
      </div>
      <div class="card">
        <h2>Taking the map</h2>
        <p>Each corner sets a profit target over a handful of days. Clear it and the corner is yours, and the next one opens.</p>
        <p>Corners run through four tiers — ${Object.values(C.TIERS).map((t) => `${t.icon} ${t.label}`).join(', ')}.
        Every target is measured against what near-perfect play earns on that exact corner, so a hard city is never an unfair one.</p>
        <p>Claim all ${C.CORNERS_PER_CITY} corners to take a city. Finish ${C.CITIES_FOR_OPS} cities and you can start running
        depots, buying wholesale and staffing corners so they trade while you work.</p>
      </div>`,
    actions: `<button class="btn" data-act="back-from-help">Back</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * World
 * ------------------------------------------------------------------ */

function worldScreen() {
  const campaign = store.campaign;
  const progress = C.campaignProgress(campaign);
  const rows = C.CITIES.map((city, i) => {
    const claimed = C.claimedIn(campaign, city.id).length;
    const unlocked = C.isCityUnlocked(campaign, city.id);
    const done = C.cityDone(campaign, city.id);
    if (!unlocked) {
      return `<div class="city locked">
          <div class="city-flag">🔒</div>
          <div class="city-main">
            <div class="city-name">${city.name}</div>
            <div class="row-sub">Take ${i - progress.cities} more cit${i - progress.cities === 1 ? 'y' : 'ies'} to unlock</div>
          </div>
        </div>`;
    }
    return `<button class="city ${done ? 'done' : ''}" data-act="open-city" data-city="${city.id}">
        <div class="city-flag">${city.flag}</div>
        <div class="city-main">
          <div class="city-name">${city.name} ${done ? '<span class="tick">✓</span>' : ''}</div>
          <div class="row-sub">${city.challenge.name}</div>
          ${bar(claimed / C.CORNERS_PER_CITY)}
        </div>
        <div class="city-count">${claimed}<small>/${C.CORNERS_PER_CITY}</small></div>
      </button>`;
  }).join('');

  return {
    body: `
      <h1>The Map</h1>
      <p class="muted">${progress.corners} of ${progress.totalCorners} corners claimed.
        ${progress.cities > 0 ? `${progress.cities} cit${progress.cities === 1 ? 'y' : 'ies'} taken.` : 'Take a city by claiming all 25 of its corners.'}</p>
      ${store.ui.opsReport ? opsReportCard(store.ui.opsReport) : ''}
      <div class="city-list">${rows}</div>`,
    actions: `
      ${opsUnlocked(campaign)
        ? '<button class="btn" data-act="open-ops">🏭 Operations</button>'
        : `<div class="locked-note">🏭 Operations unlock after ${C.CITIES_FOR_OPS} cities (${C.completedCities(campaign).length}/${C.CITIES_FOR_OPS})</div>`}
      <button class="btn-ghost" data-act="open-bank">🏦 Bank${campaign.bank?.balance > 0 ? ` · ${whole(campaign.bank.balance)}` : ''}</button>
      <button class="btn-ghost" data-act="to-title">Menu</button>`,
  };
}

function opsReportCard(report) {
  const used = report.stockUsed || { lemons: 0, sugar: 0, cups: 0 };
  const units = used.lemons + used.sugar + used.cups;
  return `
    <div class="card ops-report">
      <h2>While you were working</h2>
      <p>Your network traded for ${report.days} day${report.days === 1 ? '' : 's'}:
        <strong class="${report.net >= 0 ? 'good' : 'bad'}">${money(report.net)}</strong>
        into the treasury from ${report.cups} cups.</p>
      ${units > 0
        ? `<p class="muted">It drew ${units} units out of your depots — about ${money(restockCost(used, store.campaign))} to replace.</p>`
        : ''}
      ${report.produced && (report.produced.lemons + report.produced.sugar + report.produced.cups) > 0
        ? `<p class="muted">Farms and the factory pressed ${report.produced.lemons + report.produced.sugar + report.produced.cups} units straight into the depots, for free.</p>`
        : ''}
      ${report.trucked > 0 ? `<p class="muted">Trucks hauled ${report.trucked} units between depots.</p>` : ''}
      ${report.dry.length ? `<p class="warn">⚠️ Ran short in ${report.dry.map((id) => C.getCity(id).name).join(', ')}.</p>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * City
 * ------------------------------------------------------------------ */

function cityScreen() {
  const campaign = store.campaign;
  const city = C.getCity(store.ui.cityId);
  const corners = C.cornersFor(city.id);
  const claimed = C.claimedIn(campaign, city.id);

  const list = corners.map((corner, i) => {
    const isClaimed = claimed.includes(i);
    const unlocked = C.isCornerUnlocked(campaign, city.id, i);
    const target = unlocked || isClaimed ? C.targetFor(campaign, city.id, i) : null;
    const cls = isClaimed ? 'claimed' : unlocked ? 'open' : 'locked';
    return `<button class="corner ${cls}" ${unlocked && !isClaimed ? `data-act="open-corner" data-index="${i}"` : 'disabled'}>
        <div class="corner-no">${isClaimed ? '✓' : unlocked ? i + 1 : '🔒'}</div>
        <div class="corner-main">
          <div class="corner-name">${unlocked || isClaimed ? corner.name : '???'}</div>
          <div class="row-sub">${tierPill(corner.tier)}${corner.quirk && (unlocked || isClaimed) ? ` · ${corner.quirk}` : ''}</div>
        </div>
        ${target != null ? `<div class="corner-target">${whole(target)}<small>target</small></div>` : ''}
      </button>`;
  }).join('');

  return {
    body: `
      ${backBar('The Map', 'to-world')}
      <div class="head-row">
        <h1>${city.flag} ${city.name}</h1>
        <div class="treasury">${claimed.length}<small>/${C.CORNERS_PER_CITY}</small></div>
      </div>
      <div class="card challenge">
        <h2>${city.challenge.name}</h2>
        <p>${city.challenge.blurb}</p>
      </div>
      <div class="corner-list">${list}</div>`,
    actions: C.cityDone(campaign, city.id)
      ? `<div class="locked-note">✓ ${city.name} is yours — every corner claimed.</div>
         <button class="btn" data-act="to-world">Back to the Map</button>`
      : `<button class="btn" data-act="open-next">Next Corner</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Corner briefing
 * ------------------------------------------------------------------ */

function cornerScreen() {
  const campaign = store.campaign;
  const { cityId, cornerIndex } = store.ui;
  const city = C.getCity(cityId);
  const corner = C.cornersFor(cityId)[cornerIndex];
  const tier = C.TIERS[corner.tier];
  const config = C.runConfigFor(cityId, cornerIndex);
  const target = C.targetFor(campaign, cityId, cornerIndex);
  const notes = C.describeMods(config.mods);

  return {
    body: `
      ${backBar(city.name, 'to-city')}
      <h1>${corner.name}</h1>
      <p class="muted">${city.flag} ${city.name} · corner ${cornerIndex + 1} of ${C.CORNERS_PER_CITY}
        ${corner.quirk ? `· ${corner.quirk}` : ''}</p>
      <div class="card">
        <div class="head-row" style="margin-bottom:12px">
          ${tierPill(corner.tier)}
          <span class="muted">${tier.blurb}</span>
        </div>
        <div class="facts">
          ${fact('You start with', money(tier.stake))}
          ${fact('Days to trade', tier.days)}
          ${fact('Profit needed', whole(target), 'good')}
          ${fact('On a retry', 'same weather')}
        </div>
      </div>
      <div class="card">
        <h2>What you are walking into</h2>
        <ul class="notes">
          ${notes.map((n) => `<li>${n.icon} ${n.text}</li>`).join('') || '<li>An ordinary corner. No excuses.</li>'}
        </ul>
      </div>
      ${E.hasMA(campaign) ? acquireCard(campaign, cityId, cornerIndex) : ''}`,
    actions: `
      <button class="btn" data-act="start-run">Set Up Here</button>
      <button class="btn-ghost" data-act="to-city">Pick Another Corner</button>`,
  };
}

/** M&A: skip playing this corner and just buy it, at a stiff premium. */
function acquireCard(campaign, cityId, cornerIndex) {
  const cost = C.acquisitionCost(campaign, cityId, cornerIndex);
  return `
    <div class="card">
      <h2>🤝 M&amp;A</h2>
      <p class="muted">Your specialist can buy this corner outright instead of you playing it —
        at three times the profit target, since a shortcut is not a bargain.</p>
      <div class="chip-row" style="margin-top:10px">
        <button class="chip" data-act="acquire-corner" data-city="${cityId}" data-index="${cornerIndex}"
          ${campaign.treasury < cost ? 'disabled' : ''}>
          Buy It Out · ${money(cost)}
        </button>
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export const screens = {
  title: titleScreen,
  help: helpScreen,
  world: worldScreen,
  city: cityScreen,
  corner: cornerScreen,
};

export const actions = {
  'new-campaign': () => {
    clearSave();
    store.campaign = C.newCampaign();
    store.run = null;
    store.ui.opsReport = null;
    store.ui.view = 'world';
  },
  continue: () => {
    const saved = loadSave();
    if (!saved) return;
    store.campaign = saved.campaign;
    store.run = saved.run;
    store.ui.cityId = saved.cityId;
    store.ui.cornerIndex = saved.cornerIndex;
    store.ui.view = saved.run ? 'run' : saved.view || 'world';
  },
  help: () => { store.ui.view = 'help'; },
  'back-from-help': () => { store.ui.view = store.campaign ? 'world' : 'title'; },
  'to-title': () => { save(); store.ui.view = 'title'; },
  'to-world': () => { store.ui.view = 'world'; },
  'to-city': () => { store.ui.view = 'city'; },
  'open-city': (el) => {
    store.ui.cityId = el.dataset.city;
    store.ui.view = 'city';
    store.ui.opsReport = null;
  },
  'open-corner': (el) => {
    store.ui.cornerIndex = Number(el.dataset.index);
    store.ui.view = 'corner';
  },
  'open-next': () => {
    const next = C.nextCorner(store.campaign, store.ui.cityId);
    if (next == null) return;
    store.ui.cornerIndex = next;
    store.ui.view = 'corner';
  },
  'acquire-corner': (el) => {
    const cityId = el.dataset.city;
    const index = Number(el.dataset.index);
    const result = C.acquireCorner(store.campaign, cityId, index);
    if (!result.ok) { store.ui.notice = result.why; return; }
    store.ui.claimResult = result;
    const toast = achievementToast(checkAchievements({ acquiredCorner: true }));
    store.ui.notice = toast || `🤝 ${C.getCity(cityId).name} corner acquired.`;
    store.ui.view = 'city';
  },
};
