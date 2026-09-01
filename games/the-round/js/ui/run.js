/**
 * The Round — the screens for one season, a day at a time.
 *
 * forecast → route → report → forecast … → gameover
 *
 * The report is rendered from `store.ui.pending`, which holds the day that has
 * just been worked. Clearing it drops back to the next forecast.
 */
import { store, render, recordBest } from '../store.js';
import * as S from '../sim.js';
import * as C from '../campaign.js';
import { runFirmDays } from '../ops.js';
import { money, whole, pct, clock, fact, bar, roundMap } from './kit.js';

const active = (r) => r.properties.filter((p) => p.active);
const due = (p) => S.isDue(p);

/* ------------------------------------------------------------------ *
 * Forecast
 * ------------------------------------------------------------------ */

function forecast() {
  const r = store.run;
  const w = S.WEATHER[r.today.weather];
  const offer = r.today.offer;
  const dueCount = active(r).filter(due).length;
  const atRisk = active(r).filter((p) => p.patience < 0.3).length;
  const last = r.history[r.history.length - 1];

  return {
    body: `
      <h1 class="title">Day ${r.day} <span class="of">of ${r.days}</span></h1>
      <p class="sub">${r.neighbourhood ? r.neighbourhood.name : 'Free season'}</p>

      <section class="card weather">
        <div class="weather-head">
          <span class="weather-icon">${w.icon}</span>
          <div>
            <div class="weather-name">${w.label}</div>
            <div class="weather-sub">${clock(r.today.workable)} of workable daylight${r.today.wet ? ' · grass is wet' : ''}</div>
          </div>
        </div>
      </section>

      <section class="facts">
        ${fact('Lawns due', dueCount, dueCount === 0 ? 'muted' : '')}
        ${fact('On the books', active(r).length)}
        ${fact('At risk', atRisk, atRisk ? 'bad' : 'good')}
        ${fact('Blade', pct(r.sharpness), r.sharpness < 0.4 ? 'bad' : '')}
      </section>

      ${offer ? `
        <section class="card offer">
          <h2 class="card-title">New work</h2>
          <div class="row">
            <div class="row-main">
              <div class="row-name">${offer.name}</div>
              <div class="row-sub">${money(offer.rate)} a visit · ${money(offer.signing)} to sign · size ${offer.size.toFixed(1)}</div>
            </div>
          </div>
          <p class="muted small">More money, and one more lawn competing for the same daylight.</p>
          <div class="offer-actions">
            <button class="btn" data-act="takeOffer">Take it on</button>
            <button class="btn ghost" data-act="declineOffer">Turn it down</button>
          </div>
        </section>` : ''}

      ${last ? `
        <section class="card notes">
          <h2 class="card-title">Word from the round</h2>
          <ul>${last.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
        </section>` : `
        <section class="card notes">
          <h2 class="card-title">Word from the round</h2>
          <p class="muted">Nothing yet. They will tell you soon enough.</p>
        </section>`}
    `,
    actions: `<button class="btn primary" data-act="toRoute">Plan the round</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The route board
 * ------------------------------------------------------------------ */

function routeScreen() {
  const r = store.run;
  const plan = S.planRoute(r, r.route);
  const over = plan.minutes > r.today.workable;
  const spent = Math.min(plan.minutes, r.today.workable);

  // The list is ordered by what a person would scan for: due first, then the
  // ones about to walk, then everything else.
  const rows = active(r)
    .slice()
    .sort((a, b) => {
      const step = r.route.indexOf(a.id) - r.route.indexOf(b.id);
      if (r.route.includes(a.id) && r.route.includes(b.id)) return step;
      if (r.route.includes(a.id)) return -1;
      if (r.route.includes(b.id)) return 1;
      if (due(a) !== due(b)) return due(a) ? -1 : 1;
      return a.patience - b.patience;
    })
    .map((p) => {
      const step = r.route.indexOf(p.id);
      const leg = plan.legs.find((l) => l.id === p.id);
      const overdueBy = Math.max(0, S.daysSinceCut(p, r.day) - p.expectedGap);
      const detail = step >= 0
        ? `${clock(leg ? leg.drive : 0)} drive · ${clock(leg ? leg.mow : 0)} mowing${leg && !leg.fits ? ' · won’t fit' : ''}`
        : `${money(p.rate)} · size ${p.size.toFixed(1)} · ${due(p) ? `${p.height.toFixed(1)}cm, ready` : `${p.height.toFixed(1)}cm, nothing to cut yet`}`;

      return `
        <button class="lawn-row ${step >= 0 ? 'picked' : ''} ${leg && !leg.fits ? 'wont-fit' : ''}"
                data-act="toggleStop" data-id="${p.id}">
          <span class="lawn-step-badge">${step >= 0 ? step + 1 : (due(p) ? '·' : '')}</span>
          <span class="lawn-main">
            <span class="lawn-name">${p.name}${overdueBy > 0 ? ` <em>${overdueBy}d late</em>` : ''}</span>
            <span class="lawn-sub">${detail}</span>
          </span>
          <span class="lawn-patience">${bar(p.patience, p.patience < 0.3 ? 'bar-bad' : '')}</span>
        </button>`;
    }).join('');

  return {
    body: `
      <h1 class="title">Day ${r.day} <span class="of">the round</span></h1>
      <p class="sub">Tap in the order you will drive it. The van starts and ends at the yard.</p>

      ${roundMap(r.properties, r.route, { due })}

      <section class="card">
        <div class="row">
          <div class="row-main">
            <div class="row-name">${clock(spent)} of ${clock(r.today.workable)}</div>
            <div class="row-sub">${plan.doable.length} lawn${plan.doable.length === 1 ? '' : 's'} · ${clock(plan.drive)} of it driving</div>
          </div>
          <div class="row-meter">${bar(plan.minutes / r.today.workable, over ? 'bar-bad' : '')}</div>
        </div>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Sharpen the blade</div>
            <div class="row-sub">${clock(S.SHARPEN_MINUTES)} and ${money(S.SHARPEN_COST)} now · blade is at ${pct(r.sharpness)}</div>
          </div>
          <button class="chip ${r.sharpenToday ? 'on' : ''}" data-act="toggleSharpen">
            ${r.sharpenToday ? 'Booked in' : 'Not today'}
          </button>
        </div>
      </section>

      ${over ? `<div class="warn">The last stops will not fit before dark. They are greyed out — the day stops there.</div>` : ''}
      ${r.route.length === 0 ? `<div class="notice">Nothing planned. A day with no work still burns a day.</div>` : ''}

      <section class="lawn-list">${rows}</section>
      ${r.route.length ? `<button class="btn ghost wide" data-act="clearRoute">Clear the route</button>` : ''}
    `,
    actions: `<button class="btn primary" data-act="workDay">Work the day</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

function report() {
  const r = store.run;
  const res = store.ui.pending;
  const done = r.phase === 'gameover';
  const w = S.WEATHER[res.weather];

  return {
    body: `
      <h1 class="title">Day ${res.day} <span class="of">done</span></h1>
      <p class="sub">${w.icon} ${w.label} · ${clock(res.minutes)} worked</p>

      <section class="facts">
        ${fact('Cut', res.jobs.filter((j) => j.due).length)}
        ${fact('Earned', money(res.earned), 'good')}
        ${fact('Fuel', money(res.fuel), 'bad')}
        ${fact('Profit', money(res.profit), res.profit >= 0 ? 'good' : 'bad')}
      </section>

      ${res.jobs.length ? `
        <section class="card">
          <h2 class="card-title">The day's work</h2>
          ${res.jobs.map((j) => `
            <div class="row">
              <div class="row-main">
                <div class="row-name">${j.name}</div>
                <div class="row-sub">${j.note}</div>
              </div>
              <div class="row-value ${j.due ? '' : 'muted'}">${j.due ? money(j.rate) : '—'}</div>
            </div>`).join('')}
        </section>` : `
        <section class="card"><p class="muted">You did not cut anything today.</p></section>`}

      <section class="card notes">
        <h2 class="card-title">Word from the round</h2>
        <ul>${res.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
      </section>
    `,
    actions: done
      ? `<button class="btn primary" data-act="closeReport">See the season</button>`
      : `<button class="btn primary" data-act="closeReport">Day ${r.day}</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * Season's end
 * ------------------------------------------------------------------ */

function gameover() {
  const r = store.run;
  const score = S.finalScore(r);
  const inCampaign = Boolean(r.neighbourhood);
  const won = score.won;

  return {
    body: `
      <h1 class="title">${score.rank.icon} ${score.rank.title}</h1>
      <p class="sub">${r.neighbourhood ? r.neighbourhood.name : 'Free season'} — ${r.days} days</p>

      ${inCampaign ? `
        <div class="verdict ${won ? 'good' : 'bad'}">
          ${won
            ? `You cleared ${money(score.net)} against a target of ${whole(score.target)}. The round is yours.`
            : `You cleared ${money(score.net)}. The target was ${whole(score.target)}.`}
        </div>` : ''}

      <section class="facts">
        ${fact('Profit', money(score.net), score.net >= 0 ? 'good' : 'bad')}
        ${fact('Lawns cut', score.visits)}
        ${fact('Clients kept', score.kept, 'good')}
        ${fact('Lost', score.lost, score.lost ? 'bad' : '')}
      </section>

      ${r.lost.length ? `
        <section class="card">
          <h2 class="card-title">Who walked</h2>
          ${r.lost.map((l) => `<div class="row"><div class="row-main"><div class="row-name">${l.name}</div></div>
            <div class="row-value bad">${money(l.rate)}/visit</div></div>`).join('')}
        </section>` : ''}
    `,
    actions: inCampaign
      ? (won
          ? `<button class="btn primary" data-act="bankRun">Take the round</button>`
          : `<button class="btn primary" data-act="retryRun">Try again</button>
             <button class="btn" data-act="abandonRun">Back to the town</button>`)
      : `<button class="btn primary" data-act="abandonRun">Done</button>`,
  };
}

export const screens = { forecast, route: routeScreen, report, gameover };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

export const actions = {
  toRoute() { store.run.phase = 'route'; },

  takeOffer() {
    S.acceptOffer(store.run);
    store.ui.notice = 'Signed up. They will expect you like everyone else.';
  },
  declineOffer() { store.run.today.offer = null; },

  toggleStop(el) {
    const r = store.run;
    const id = Number(el.dataset.id);
    const at = r.route.indexOf(id);
    if (at >= 0) r.route.splice(at, 1);
    else r.route.push(id);
  },

  toggleSharpen() { store.run.sharpenToday = !store.run.sharpenToday; },
  clearRoute() { store.run.route = []; },

  workDay() {
    const r = store.run;
    const result = S.simulateDay(r);
    S.commitDay(r, result);
    store.ui.pending = result;
  },

  closeReport() {
    store.ui.pending = null;
    if (store.run.phase !== 'gameover') store.run.phase = 'forecast';
  },

  /** Won it: bank the profit, tick the firm, and go back to the town. */
  bankRun() {
    const r = store.run;
    const campaign = store.campaign;
    const score = S.finalScore(r);
    const { townId, index } = r.neighbourhood;

    campaign.stats.runsPlayed += 1;
    campaign.stats.runsWon += 1;
    const change = C.holdRound(campaign, townId, index, score.net, score.visits);
    recordBest(campaign.stats.lawnsCut);

    // The firm runs for exactly as long as you were out working.
    store.ui.opsReport = campaign.ops ? runFirmDays(campaign, r.days) : null;

    store.run = null;
    store.ui.pending = null;
    store.ui.view = 'town';
    store.ui.notice = change.opsJustUnlocked
      ? 'Five towns held. Time to open a yard and put a second crew on.'
      : change.townJustDone
        ? `${C.getTown(townId).name} is all yours.`
        : null;
  },

  retryRun() {
    const { townId, index } = store.run.neighbourhood;
    store.campaign.stats.runsPlayed += 1;
    startRound(townId, index);
  },

  abandonRun() {
    if (store.run?.neighbourhood) store.campaign.stats.runsPlayed += 1;
    store.run = null;
    store.ui.pending = null;
    store.ui.view = store.campaign ? 'town' : 'title';
  },
};

/** Begin a round. Exported so the map can start one too. */
export function startRound(townId, roundIndex) {
  const config = C.runConfigFor(townId, roundIndex);
  const target = C.targetFor(store.campaign, townId, roundIndex);
  store.run = S.newRun({ ...config, target });
  store.ui.townId = townId;
  store.ui.roundIndex = roundIndex;
  store.ui.pending = null;
  store.ui.view = 'run';
  render();
}
