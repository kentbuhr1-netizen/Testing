/**
 * Outbreak — the screens for one district, a week at a time.
 *
 * briefing → measures → report → briefing … → gameover
 *
 * The report is rendered from `store.ui.pending`, which holds the week that
 * has just been committed. Clearing it drops back to the next briefing.
 */
import { store, render, recordBest } from '../store.js';
import * as S from '../sim.js';
import * as C from '../campaign.js';
import { runAgencyWeeks } from '../ops.js';
import { money, lives, pct, fact, tierPill, bar, stepper, pips } from './kit.js';

const round1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ *
 * Briefing
 * ------------------------------------------------------------------ */

function briefing() {
  const r = store.run;
  const p = r.pathogen;
  const last = r.history[r.history.length - 1];
  const wardLoad = r.i * p.hosp;
  const beds = r.bedCapacity + r.bedQueue;

  return {
    body: `
      <h1 class="title">Week ${r.week} <span class="of">of ${r.weeks}</span></h1>
      <p class="sub">${r.district ? r.district.name : 'Free response'}</p>

      <section class="card pathogen">
        <div class="pathogen-head">
          <span class="pathogen-icon">${p.icon}</span>
          <div>
            <div class="pathogen-name">${p.name}</div>
            <div class="pathogen-r0">R₀ estimated at ${p.r0}</div>
          </div>
        </div>
        <p class="muted">${p.blurb}</p>
      </section>

      <section class="facts">
        ${fact('Active cases', lives(r.i))}
        ${fact('New last week', last ? lives(last.toInfectious) : '—')}
        ${fact('Deaths so far', lives(r.d), 'bad')}
        ${fact('Ward load', `${lives(wardLoad)} / ${lives(beds)}`,
          wardLoad > beds ? 'bad' : '')}
      </section>

      <section class="card">
        <div class="row">
          <div class="row-main">
            <div class="row-name">Public compliance</div>
            <div class="row-sub">How far people will actually go along with a closure.</div>
          </div>
          <div class="row-meter">${bar(r.compliance, r.compliance < 0.4 ? 'bar-bad' : '')}</div>
        </div>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Budget</div>
            <div class="row-sub">${money(r.baseFunds)} a week before closures bite.</div>
          </div>
          <div class="row-value">${money(r.funds)}</div>
        </div>
      </section>

      ${last ? `
        <section class="card notes">
          <h2 class="card-title">Surveillance</h2>
          <ul>${last.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
        </section>` : `
        <section class="card notes">
          <h2 class="card-title">Surveillance</h2>
          <p class="muted">Nothing yet. The first week will tell you what you are dealing with.</p>
        </section>`}
    `,
    actions: `<button class="btn primary" data-act="toMeasures">Set this week’s measures</button>
             <button class="btn ghost" data-act="open-bonus-shop">🎬 Bonus</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Measures
 * ------------------------------------------------------------------ */

/** What each lever would do, at the level currently dialled in. */
function leverReadout(id, level) {
  const r = store.run;
  // Wards already open still cost money with the lever at zero, and that is
  // exactly when the player most needs telling.
  const standing = id === 'beds' ? S.bedUpkeep(r.builtBeds) : 0;
  if (level === 0 && standing === 0) return 'Off.';
  if (id === 'trace') {
    const reach = S.traceReach(r, level);
    const cut = S.traceCut(r, level);
    return `Reaches ${pct(reach)} of contacts. Cuts transmission ${pct(cut)}.`;
  }
  if (id === 'distance') {
    const cut = S.distanceCut(r, level);
    const econ = S.economyFactor(r, level);
    return `Cuts transmission ${pct(cut)}. Budget falls to ${pct(econ)} of normal.`;
  }
  if (id === 'vaccine') {
    const doses = r.pop * S.VAX_PER_LEVEL * level;
    const at = r.week + r.pathogen.vaccineLag + r.mods.vaccineDelay;
    return `${lives(doses)} doses. Protection lands in week ${at}.`;
  }
  const open = standing > 0
    ? `${lives(r.builtBeds)} open, ${money(standing)} a week to staff.`
    : '';
  if (level === 0) return open;
  const added = r.pop * S.BED_PER_LEVEL * level;
  return `${lives(added)} more beds, open next week — ${money(S.bedUpkeep(added))} a week `
    + `to staff, for good.${open ? ` ${open}` : ''}`;
}

function measures() {
  const r = store.run;
  const bill = S.weeklySpend(r.levels, r.pop, r.builtBeds);
  const left = round1(r.funds - bill);

  const levers = S.LEVERS.map((lever) => {
    const level = r.levels[lever.id];
    const cost = S.LEVER_COST[lever.id] * (r.pop / S.REF_POP);
    return `
      <div class="lever">
        <div class="lever-head">
          <span class="lever-icon">${lever.icon}</span>
          <div class="lever-name">${lever.label}</div>
          <div class="lever-cost">${cost > 0 ? `${money(cost)} / level` : 'No cost'}</div>
        </div>
        <p class="lever-blurb">${lever.blurb}</p>
        <div class="lever-controls">
          ${pips(level)}
          ${stepper('levels', lever.id, level, 1, 0, S.MAX_LEVEL)}
        </div>
        <p class="lever-readout">${leverReadout(lever.id, level)}</p>
      </div>`;
  }).join('');

  return {
    body: `
      <h1 class="title">Week ${r.week} <span class="of">measures</span></h1>
      <p class="sub">Everything you fund is owed this week, whatever it achieves.</p>

      <section class="facts">
        ${fact('Budget', money(r.funds))}
        ${fact('This week', money(bill), bill > r.funds ? 'bad' : '')}
        ${fact('Left over', money(left), left < 0 ? 'bad' : 'good')}
        ${r.builtBeds > 0 ? fact('Ward staffing', money(S.bedUpkeep(r.builtBeds))) : ''}
      </section>

      ${bill > r.funds ? `<div class="warn">This week’s programme costs more than the budget. Scale something back.</div>` : ''}
      ${r.compliance < 0.4 ? `<div class="warn">Compliance is at ${pct(r.compliance)}. Closures are close to symbolic.</div>` : ''}

      <section class="levers">${levers}</section>
    `,
    actions: `<button class="btn primary" data-act="runWeek" ${bill > r.funds ? 'disabled' : ''}>Run the week</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function report() {
  const r = store.run;
  const res = store.ui.pending;
  const done = r.phase === 'gameover';

  return {
    body: `
      <h1 class="title">Week ${res.week} <span class="of">report</span></h1>
      <p class="sub">${res.levels.distance > 0 ? `Distancing at level ${res.levels.distance}.` : 'Nothing was closed.'}</p>

      <section class="facts">
        ${fact('New cases', lives(res.toInfectious))}
        ${fact('Deaths', lives(res.deaths), 'bad')}
        ${fact('Active now', lives(r.i))}
        ${fact('Ward peak', `${lives(res.peakCare)} / ${lives(res.bedCapacity)}`,
          res.overflow > 0 ? 'bad' : 'good')}
      </section>

      <section class="card">
        <div class="row">
          <div class="row-main"><div class="row-name">Transmission left running</div></div>
          <div class="row-value">${pct(res.contactFactor)}</div>
        </div>
        <div class="row">
          <div class="row-main"><div class="row-name">Spent / received</div></div>
          <div class="row-value">${money(res.spend)} / ${money(res.income)}</div>
        </div>
        ${res.doses > 0 ? `
        <div class="row">
          <div class="row-main"><div class="row-name">Doses given</div></div>
          <div class="row-value">${lives(res.doses)}</div>
        </div>` : ''}
      </section>

      <section class="card notes">
        <h2 class="card-title">Surveillance</h2>
        <ul>${res.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
      </section>
    `,
    actions: done
      ? `<button class="btn primary" data-act="closeReport">See the outcome</button>`
      : `<button class="btn primary" data-act="closeReport">Week ${r.week}</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Outcome
 * ------------------------------------------------------------------ */

function gameover() {
  const r = store.run;
  const score = S.finalScore(r);
  const inCampaign = Boolean(r.district);
  const won = score.won;

  return {
    body: `
      <h1 class="title">${score.rank.icon} ${score.rank.title}</h1>
      <p class="sub">${r.district ? r.district.name : 'Free response'} — ${r.weeks} weeks</p>

      ${inCampaign ? `
        <div class="verdict ${won ? 'good' : 'bad'}">
          ${won
            ? `You saved ${lives(score.saved)} lives against a target of ${lives(score.target)}. The district is yours.`
            : `You saved ${lives(score.saved)} lives. The target was ${lives(score.target)}.`}
        </div>` : ''}

      <section class="facts">
        ${fact('Lives saved', lives(score.saved), 'good')}
        ${fact('Died', lives(score.deaths), 'bad')}
        ${fact('If ignored', lives(score.baselineDeaths))}
        ${fact('Ever infected', pct(score.attackRate))}
      </section>

      <section class="card">
        <div class="row">
          <div class="row-main"><div class="row-name">Share of the deaths prevented</div></div>
          <div class="row-meter">${bar(score.savedShare)}</div>
        </div>
        <div class="row">
          <div class="row-main"><div class="row-name">Peak ward load</div></div>
          <div class="row-value">${lives(score.peakCare)}</div>
        </div>
        <div class="row">
          <div class="row-main"><div class="row-name">Budget unspent</div></div>
          <div class="row-value">${money(score.fundsLeft)}</div>
        </div>
      </section>
    `,
    actions: inCampaign
      ? (won
          ? `<button class="btn primary" data-act="bankRun">Hold the district</button>`
          : `<button class="btn primary" data-act="retryRun">Try again</button>
             <button class="btn" data-act="abandonRun">Back to the region</button>`)
      : `<button class="btn primary" data-act="abandonRun">Done</button>`,
  };
}

export const screens = { briefing, measures, report, gameover };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export const actions = {
  toMeasures() {
    const r = store.run;
    // Last week's programme may no longer be affordable — closures shrink the
    // budget. Scale it back rather than stranding the player on a dead button.
    const before = S.weeklySpend(r.levels, r.pop, r.builtBeds);
    const closed = S.affordWeek(r);
    const after = S.weeklySpend(r.levels, r.pop, r.builtBeds);
    if (closed > 0) {
      store.ui.notice = `The budget cannot staff every ward. ${lives(closed)} beds have closed to balance the books.`;
    } else if (after < before) {
      store.ui.notice = 'The budget will not stretch to last week’s programme. Some measures have been scaled back.';
    }
    r.phase = 'measures';
  },

  runWeek() {
    const r = store.run;
    if (S.weeklySpend(r.levels, r.pop, r.builtBeds) > r.funds) return;
    const result = S.simulateWeek(r);
    S.commitWeek(r, result);
    store.ui.pending = result;
  },

  closeReport() {
    store.ui.pending = null;
    if (store.run.phase !== 'gameover') store.run.phase = 'briefing';
  },

  /** Won it: bank the lives, tick the agency, and go back to the region. */
  bankRun() {
    const r = store.run;
    const campaign = store.campaign;
    const score = S.finalScore(r);
    const { regionId, index } = r.district;

    campaign.stats.runsPlayed += 1;
    campaign.stats.runsWon += 1;
    const change = C.holdDistrict(campaign, regionId, index, score.saved);
    recordBest(campaign.stats.livesSaved);

    // The agency runs for exactly as long as you were working by hand.
    store.ui.opsReport = campaign.ops ? runAgencyWeeks(campaign, r.weeks) : null;

    store.run = null;
    store.ui.pending = null;
    store.ui.view = 'region';
    store.ui.notice = change.opsJustUnlocked
      ? 'Five regions held. The agency is yours — build laboratories and station teams.'
      : change.regionJustDone
        ? `${C.getRegion(regionId).name} is clear.`
        : null;
  },

  retryRun() {
    const r = store.run;
    const { regionId, index } = r.district;
    store.campaign.stats.runsPlayed += 1;
    startDistrict(regionId, index);
  },

  abandonRun() {
    if (store.run?.district) store.campaign.stats.runsPlayed += 1;
    store.run = null;
    store.ui.pending = null;
    store.ui.view = store.campaign ? 'region' : 'title';
  },
};

/** Begin a district. Exported so the map can start one too. */
export function startDistrict(regionId, districtIndex) {
  const config = C.runConfigFor(regionId, districtIndex);
  const target = C.targetFor(store.campaign, regionId, districtIndex);
  store.run = S.newRun({ ...config, target });
  store.ui.regionId = regionId;
  store.ui.districtIndex = districtIndex;
  store.ui.pending = null;
  store.ui.view = 'run';
  render();
}
