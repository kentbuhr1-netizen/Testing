/**
 * The Forge — the screens for one commission, a shift at a time.
 *
 * briefing → bench → anvil → report → briefing … → gameover
 *
 * The anvil is the clicker: every tap is one swing of your own hammer, banked
 * for this shift only, up to what one pair of arms can manage in eight hours.
 * It is the only input in the game that is not a number you dial in, and it is
 * the one thing the guild can never do for you.
 *
 * The report is rendered from `store.ui.pending`, which holds the shift that
 * has just been worked. Clearing it drops back to the next briefing.
 */
import { store, render, recordBest, save } from '../store.js';
import * as S from '../sim.js';
import * as C from '../campaign.js';
import { runGuildShifts } from '../ops.js';
import { money, count, pct, fact, bar, stepper, pips, heatColour } from './kit.js';

const round1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ *
 * Briefing
 * ------------------------------------------------------------------ */

function briefing() {
  const r = store.run;
  const a = r.alloy;
  const last = r.history[r.history.length - 1];
  const left = r.target != null ? Math.max(0, r.target - Math.round(r.pieces)) : null;

  return {
    body: `
      <h1 class="title">Shift ${r.shift} <span class="of">of ${r.shifts}</span></h1>
      <p class="sub">${r.workshop ? r.workshop.name : 'Open bench'}</p>

      <section class="card alloy">
        <div class="alloy-head">
          <span class="alloy-icon">${a.icon}</span>
          <div>
            <div class="alloy-name">${a.name}</div>
            <div class="alloy-note">${round1(a.swingsPerPiece)} swings to the piece · ${money(S.piecePrice(r))} apiece</div>
          </div>
        </div>
        <p class="muted">${a.blurb}</p>
      </section>

      <section class="facts">
        ${fact('Delivered', count(r.pieces), 'good')}
        ${left != null ? fact('Still owed', count(left), left > 0 ? '' : 'good') : fact('Scrapped', count(r.scrapped), 'bad')}
        ${fact('Purse', money(r.coin))}
        ${fact('Die sets', count(r.dieSets))}
      </section>

      <section class="card">
        <div class="row">
          <div class="row-main">
            <div class="row-name">Morale</div>
            <div class="row-sub">Tired apprentices swing less and ruin more.</div>
          </div>
          <div class="row-meter">${bar(r.morale, r.morale < 0.4 ? 'bar-bad' : '')}</div>
        </div>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Retainer</div>
            <div class="row-sub">Paid every shift, whatever comes off the anvil.</div>
          </div>
          <div class="row-value">${money(r.retainer)}</div>
        </div>
      </section>

      <section class="card notes">
        <h2 class="card-title">The foreman</h2>
        ${last
          ? `<ul>${last.notes.map((n) => `<li>${n}</li>`).join('')}</ul>`
          : `<p class="muted">Nothing yet. The first shift will tell you what this metal wants.</p>`}
      </section>
    `,
    actions: `<button class="btn primary" data-act="toBench">Set up the shift</button>
             <button class="btn ghost" data-act="open-bonus-shop">🎬 Bonus</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The bench — the four levers
 * ------------------------------------------------------------------ */

/** What each lever would do, at the level currently dialled in. */
function leverReadout(id, level) {
  const r = store.run;
  if (id === 'bellows') {
    const heat = S.restingHeat(level);
    const colour = heatColour(heat);
    const cost = S.LEVER_COST.bellows * level * S.fuelFactor(r) * r.scale;
    if (level === 0) return 'The fire is out. Nothing struck cold is worth keeping.';
    return `The fire settles at <b style="color:${colour.css}">${colour.name.toLowerCase()}</b>. ${money(cost)} a shift in coke.`;
  }
  if (id === 'crew') {
    if (level === 0) return 'Nobody but you at the anvils.';
    const swings = S.crewSwings(r, level);
    return `${count(swings)} swings a shift at today’s morale. ${money(S.LEVER_COST.crew * level * r.mods.wage * r.scale)} in wages.`;
  }
  if (id === 'dies') {
    const rack = r.dieSets > 0
      ? `Rack: ${count(r.dieSets)} sets, ×${(S.dieFactor(r)).toFixed(2)} on everything, ${money(S.dieUpkeep(r.dieSets, r.mods.wear))} a shift to keep true.`
      : '';
    if (level === 0) return rack || 'No tooling. Everything is made the long way.';
    const at = r.shift + 1 + r.mods.dieDelay;
    return `${level} set${level === 1 ? '' : 's'} cut, in the rack for shift ${at}.${rack ? ` ${rack}` : ''}`;
  }
  const drain = 0.03 * level * r.mods.fatigue;
  if (level === 0) return 'Steady. Morale creeps back up.';
  return `+${pct(S.paceFactor(level) - 1)} swings. Morale −${(drain * 100).toFixed(0)} a shift, `
    + `${pct(S.scrapRate(r, level))} ruined before the heat is even judged.`;
}

function bench() {
  const r = store.run;
  const bill = S.shiftSpend(r.levels, r);
  const left = round1(r.coin - bill);

  const levers = S.LEVERS.map((lever) => {
    const level = r.levels[lever.id];
    const max = S.LEVER_MAX[lever.id];
    return `
      <div class="lever">
        <div class="lever-head">
          <span class="lever-icon">${lever.icon}</span>
          <div class="lever-name">${lever.label}</div>
          <div class="lever-cost">${lever.id === 'pace' ? 'No cost' : `0–${max}`}</div>
        </div>
        <p class="lever-blurb">${lever.blurb}</p>
        <div class="lever-controls">
          ${pips(level, max)}
          ${stepper('levels', lever.id, level, 1, 0, max)}
        </div>
        <p class="lever-readout">${leverReadout(lever.id, level)}</p>
      </div>`;
  }).join('');

  return {
    body: `
      <h1 class="title">Shift ${r.shift} <span class="of">set-up</span></h1>
      <p class="sub">Everything you light or hire is owed this shift, whatever comes off the anvil.</p>

      <section class="facts">
        ${fact('Purse', money(r.coin))}
        ${fact('This shift', money(bill), bill > r.coin ? 'bad' : '')}
        ${fact('Left over', money(left), left < 0 ? 'bad' : 'good')}
        ${r.dieSets > 0 ? fact('Keeping true', money(S.dieUpkeep(r.dieSets, r.mods.wear))) : ''}
      </section>

      ${S.affordable(r.levels, r) ? '' : `<div class="warn">This shift costs more than the purse holds. Scale something back.</div>`}
      ${r.coin < 0 ? `<div class="warn">The purse is ${money(r.coin)} in the red. Nothing can be bought until the retainer covers it.</div>` : ''}
      ${r.morale < 0.4 ? `<div class="warn">Morale is at ${pct(r.morale)}. Half the anvils are quiet by mid-afternoon.</div>` : ''}

      <section class="levers">${levers}</section>
    `,
    actions: `<button class="btn primary" data-act="toAnvil" ${S.affordable(r.levels, r) ? '' : 'disabled'}>To the anvil</button>
             <button class="btn ghost" data-act="backToBriefing">Back</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The anvil — the clicker
 * ------------------------------------------------------------------ */

function anvil() {
  const r = store.run;
  const cap = S.handCap(r);
  const crew = S.crewSwings(r, r.levels.crew) * S.paceFactor(r.levels.pace);
  const colour = heatColour(S.restingHeat(r.levels.bellows));

  return {
    body: `
      <h1 class="title">Shift ${r.shift} <span class="of">at the anvil</span></h1>
      <p class="sub">Every tap is a swing. Eight hours is all one pair of arms has in it.</p>

      <div class="forge" style="--fire:${colour.css}">
        <button class="anvil" id="anvil" data-act="noop" aria-label="Strike the metal">
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <!-- the anvil: horn, face, waist, base -->
            <path class="anvil-body" d="M40 118h94l30-16-6 16h10v18H40z"/>
            <path class="anvil-body" d="M78 136h44v22H78z"/>
            <path class="anvil-body" d="M56 158h88v14H56z"/>
            <!-- the billet on the face, lit at whatever heat the fire is running -->
            <rect class="billet" x="62" y="104" width="76" height="12" rx="6"/>
            <!-- the hammer, pivoting where the hand would be -->
            <g id="hammer" class="anvil-hammer">
              <rect class="haft" x="120" y="30" width="11" height="76" rx="5"/>
              <rect class="head" x="94" y="14" width="64" height="26" rx="7"/>
            </g>
          </svg>
        </button>
        <div class="swing-count"><output id="swings">${count(r.hands)}</output> <span class="muted">/ ${count(cap)} swings</span></div>
        <div class="progress"><i id="swing-bar" style="width:${(r.hands / cap * 100).toFixed(1)}%"></i></div>
        <p class="muted small center" id="anvil-hint">${r.hands >= cap
          ? 'That is everything you have got. Work the shift.'
          : 'Tap the anvil — or hold it — to swing.'}</p>
      </div>

      <section class="card">
        <div class="row">
          <div class="row-main"><div class="row-name">The fire</div>
            <div class="row-sub">Bellows at ${r.levels.bellows} of ${S.LEVER_MAX.bellows}. Every hammer on it pulls the heat back down.</div></div>
          <div class="row-value" style="color:${colour.css}">${colour.name}</div>
        </div>
        <div class="row">
          <div class="row-main"><div class="row-name">The apprentices</div>
            <div class="row-sub">Swinging all shift whether you do or not.</div></div>
          <div class="row-value">${count(crew)}</div>
        </div>
      </section>
    `,
    actions: `<button class="btn primary" data-act="workShift">Work the shift</button>
             <button class="btn ghost" data-act="backToBench">Back to the bench</button>`,
    mounted: wireAnvil,
  };
}

/**
 * Taps are wired straight to the DOM rather than going through a re-render.
 * A clicker that repaints the whole screen sixty times a second is a clicker
 * nobody wants to use; the counter, the bar and the hammer are the only three
 * things a swing actually changes.
 */
function wireAnvil() {
  const el = document.getElementById('anvil');
  const out = document.getElementById('swings');
  const barEl = document.getElementById('swing-bar');
  const hammer = document.getElementById('hammer');
  const hint = document.getElementById('anvil-hint');
  if (!el || !out || !barEl) return;

  const r = store.run;
  const cap = S.handCap(r);
  let repeat = null;
  let hold = null;

  const strike = () => {
    if (!store.run || store.run.hands >= cap) {
      stop();
      if (hint) hint.textContent = 'That is everything you have got. Work the shift.';
      return false;
    }
    store.run.hands += 1;
    out.textContent = count(store.run.hands);
    barEl.style.width = `${(store.run.hands / cap * 100).toFixed(1)}%`;
    if (hammer) {
      hammer.classList.remove('hit');
      void hammer.offsetWidth;          // restart the animation on every strike
      hammer.classList.add('hit');
    }
    return true;
  };

  const stop = () => {
    clearTimeout(hold);
    clearInterval(repeat);
    hold = repeat = null;
    save();                              // a shift's swings survive a reload
  };

  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    strike();
    hold = setTimeout(() => { repeat = setInterval(strike, 70); }, 350);
  });
  for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
    el.addEventListener(evt, stop);
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function report() {
  const r = store.run;
  const res = store.ui.pending;
  const done = r.phase === 'gameover';
  const colour = heatColour(res.avgHeat);

  return {
    body: `
      <h1 class="title">Shift ${res.shift} <span class="of">report</span></h1>
      <p class="sub">${count(res.hands)} swings of your own, ${count(res.swings - res.hands)} from the shop.</p>

      <section class="facts">
        ${fact('To the crate', count(res.pieces), 'good')}
        ${fact('To the scrap', count(res.ruined), 'bad')}
        ${fact('The fire ran', colour.name)}
        ${fact('Shift net', money(res.net), res.net >= 0 ? 'good' : 'bad')}
      </section>

      <section class="card">
        <div class="row">
          <div class="row-main"><div class="row-name">Work that came off clean</div></div>
          <div class="row-meter">${bar(res.cleanShare, res.cleanShare > 0.7 ? 'bar-win' : res.cleanShare < 0.35 ? 'bar-bad' : '')}</div>
        </div>
        <div class="row">
          <div class="row-main"><div class="row-name">Sold / spent</div></div>
          <div class="row-value">${money(res.revenue + res.retainer)} / ${money(res.spend + res.materials)}</div>
        </div>
        <div class="row">
          <div class="row-main"><div class="row-name">Tooling</div></div>
          <div class="row-value">×${res.tooling.toFixed(2)}</div>
        </div>
      </section>

      <section class="card notes">
        <h2 class="card-title">The foreman</h2>
        <ul>${res.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
      </section>
    `,
    actions: done
      ? `<button class="btn primary" data-act="closeReport">See the commission out</button>`
      : `<button class="btn primary" data-act="closeReport">Shift ${r.shift}</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Outcome
 * ------------------------------------------------------------------ */

function gameover() {
  const r = store.run;
  const score = S.finalScore(r);
  const inCampaign = Boolean(r.workshop);
  const won = score.won;

  return {
    body: `
      <h1 class="title">${score.rank.icon} ${score.rank.title}</h1>
      <p class="sub">${r.workshop ? r.workshop.name : 'Open bench'} — ${r.shifts} shifts</p>

      ${inCampaign ? `
        <div class="verdict ${won ? 'good' : 'bad'}">
          ${won
            ? `${count(score.pieces)} pieces delivered against a commission of ${count(score.target)}. The shop is yours.`
            : `${count(score.pieces)} pieces delivered. The commission was for ${count(score.target)}.`}
        </div>` : ''}

      <section class="facts">
        ${fact('Delivered', count(score.pieces), 'good')}
        ${fact('Scrapped', count(score.scrapped), 'bad')}
        ${fact('Clean work', pct(score.clean))}
        ${fact('Purse left', money(score.coinLeft))}
      </section>

      <section class="card">
        <div class="row">
          <div class="row-main"><div class="row-name">Work that came off clean</div></div>
          <div class="row-meter">${bar(score.clean)}</div>
        </div>
        <div class="row">
          <div class="row-main"><div class="row-name">Tooling in the rack at the end</div></div>
          <div class="row-value">${count(score.dieSets)} sets</div>
        </div>
        <div class="row">
          <div class="row-main"><div class="row-name">Morale you left them with</div></div>
          <div class="row-value">${pct(score.morale)}</div>
        </div>
      </section>
    `,
    actions: inCampaign
      ? (won
          ? `<button class="btn primary" data-act="bankRun">Take the shop</button>`
          : `<button class="btn primary" data-act="retryRun">Try again</button>
             <button class="btn" data-act="abandonRun">Back to the city</button>`)
      : `<button class="btn primary" data-act="abandonRun">Done</button>`,
  };
}

export const screens = { briefing, bench, anvil, report, gameover };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export const actions = {
  toBench() {
    const r = store.run;
    // Yesterday's set-up may no longer be affordable — a bad shift earns
    // nothing and the tooling is owed anyway. Scale it back rather than
    // stranding the player on a dead button.
    const before = S.shiftSpend(r.levels, r);
    const sold = S.affordShift(r);
    const after = S.shiftSpend(r.levels, r);
    if (sold > 0) {
      store.ui.notice = `The purse will not keep every die true. ${count(sold)} sets have been sold on to balance the books.`;
    } else if (after < before) {
      store.ui.notice = 'The purse will not stretch to yesterday’s set-up. Some of it has been scaled back.';
    }
    r.phase = 'bench';
  },

  backToBriefing() { store.run.phase = 'briefing'; },
  backToBench() { store.run.phase = 'bench'; },

  toAnvil() {
    const r = store.run;
    if (!S.affordable(r.levels, r)) return;
    r.phase = 'anvil';
  },

  workShift() {
    const r = store.run;
    if (!S.affordable(r.levels, r)) return;
    const result = S.simulateShift(r);
    S.commitShift(r, result);
    store.ui.pending = result;
  },

  closeReport() {
    store.ui.pending = null;
    if (store.run.phase !== 'gameover') store.run.phase = 'briefing';
  },

  /** Won it: bank the pieces, tick the guild, and go back to the city. */
  bankRun() {
    const r = store.run;
    const campaign = store.campaign;
    const score = S.finalScore(r);
    const { cityId, index } = r.workshop;

    campaign.stats.runsPlayed += 1;
    campaign.stats.runsWon += 1;
    const change = C.holdWorkshop(campaign, cityId, index, score.pieces);
    recordBest(campaign.stats.piecesMade);

    // The guild runs for exactly as long as you were at an anvil yourself.
    store.ui.guildReport = campaign.guild ? runGuildShifts(campaign, r.shifts) : null;

    store.run = null;
    store.ui.pending = null;
    store.ui.view = 'city';
    store.ui.notice = change.guildJustUnlocked
      ? 'Five cities held. The guild is yours — open depots and station journeymen.'
      : change.cityJustDone
        ? `${C.getCity(cityId).name} is yours.`
        : null;
  },

  retryRun() {
    const r = store.run;
    const { cityId, index } = r.workshop;
    store.campaign.stats.runsPlayed += 1;
    startWorkshop(cityId, index);
  },

  abandonRun() {
    if (store.run?.workshop) store.campaign.stats.runsPlayed += 1;
    store.run = null;
    store.ui.pending = null;
    store.ui.view = store.campaign ? 'city' : 'title';
  },
};

/** Begin a commission. Exported so the map can start one too. */
export function startWorkshop(cityId, workshopIndex) {
  const config = C.runConfigFor(cityId, workshopIndex);
  const target = C.targetFor(store.campaign, cityId, workshopIndex);
  store.run = S.newRun({ ...config, target });
  store.ui.cityId = cityId;
  store.ui.workshopIndex = workshopIndex;
  store.ui.pending = null;
  store.ui.view = 'run';
  render();
}
