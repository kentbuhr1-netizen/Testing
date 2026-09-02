/**
 * The Ledger — the screens for one book, a week at a time.
 *
 * morning → desk (one file, then the next, then the next) → report → morning …
 *
 * The report is rendered from `store.ui.pending`, which holds the week that
 * has just been settled. Clearing it drops back to the next morning.
 */
import { store, render, recordBest } from '../store.js';
import * as S from '../sim.js';
import * as C from '../campaign.js';
import { runNetworkDays } from '../ops.js';
import { money, whole, pct, rate, weeks, fact, bar, balanceSheet, queueDots } from './kit.js';

/* ------------------------------------------------------------------ *
 * Monday morning
 * ------------------------------------------------------------------ */

function morning() {
  const r = store.run;
  const forecast = S.withdrawalForecast(r);
  const known = r.revealed?.week === r.week ? r.revealed : null;
  const due = S.repaymentsDue(r);
  const live = S.liveLoans(r).length;
  const last = r.history[r.history.length - 1];
  const cap = S.capital(r);

  return {
    body: `
      <h1 class="title">Week ${r.week} <span class="of">of ${r.weeks}</span></h1>
      <p class="sub">${r.book ? r.book.name : 'Free book'}</p>

      ${balanceSheet(r.cash, S.bookValue(r), r.deposits, cap, forecast)}

      <section class="facts">
        ${fact('Confidence', pct(r.confidence), r.confidence < 0.35 ? 'bad' : r.confidence > 0.7 ? 'good' : '')}
        ${fact('Loans out', live)}
        ${fact('Due in', money(due), 'good')}
        ${fact('Files today', S.deskQueue(r).length)}
      </section>

      <section class="card">
        <h2 class="card-title">${known ? 'What the town will want back' : 'What the town may want back'}</h2>
        ${known ? `
          <p>The clearing house has it exactly: <strong>${known.flow < 0
            ? `${money(-known.flow)} going out` : `${money(known.flow)} coming in`}</strong> this week.</p>
          ${known.fright ? `<p class="bad">${known.fright}</p>` : ''}
        ` : `
          <p>${forecast.middle > 0
            ? `On this week's confidence, expect about <strong>${money(forecast.middle)}</strong> withdrawn — but it could be anywhere from ${money(Math.max(0, forecast.low))} to ${money(forecast.high)}, and a fright would be worse.`
            : `Deposits should hold or grow this week. A fright would still change that.`}</p>
        `}
        <p class="muted small">Withdrawals come at the end of the week, after you have lent.
        You cannot call a loan back in.</p>
      </section>

      ${last ? `
        <section class="card notes">
          <h2 class="card-title">Word about the town</h2>
          <ul>${last.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
        </section>` : `
        <section class="card notes">
          <h2 class="card-title">Word about the town</h2>
          <p class="muted">Nothing yet. You will hear soon enough — you always do, late.</p>
        </section>`}
    `,
    actions: `<button class="btn primary" data-act="openDesk">${
      S.deskQueue(r).length ? `See the first of ${S.deskQueue(r).length}` : 'Nobody called this week'}</button>
      <button class="btn ghost" data-act="open-bonus-shop">🎬 Bonus Shop</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The desk — one file, one answer
 * ------------------------------------------------------------------ */

function desk() {
  const r = store.run;
  const app = S.currentFile(r);
  if (!app) return morning();

  const queue = S.deskQueue(r);
  const affordable = S.canWrite(r, app);
  const after = r.cash - app.amount;
  const forecast = S.withdrawalForecast(r);
  const known = r.revealed?.week === r.week ? r.revealed : null;
  const needed = known ? Math.max(0, -known.flow) : forecast.high;
  const last = store.ui.lastDecision;

  return {
    body: `
      <h1 class="title">Week ${r.week} <span class="of">at the desk</span></h1>
      <div class="desk-head">
        ${queueDots(queue.length, r.at)}
        <button class="chip" data-act="open-bonus-shop">🎬</button>
      </div>

      ${last ? `<div class="notice">${last}</div>` : ''}

      <div class="file">
        <div class="file-head">
          <div class="file-name">${app.name}</div>
          <div class="file-purpose">${app.purposeLabel}</div>
        </div>
        <div class="file-terms">
          <div class="file-term">
            <div class="file-term-label">Wants</div>
            <div class="file-term-value">${whole(app.amount)}</div>
          </div>
          <div class="file-term">
            <div class="file-term-label">For</div>
            <div class="file-term-value">${app.term}w</div>
          </div>
          <div class="file-term">
            <div class="file-term-label">Pays</div>
            <div class="file-term-value">${rate(app.rate)}</div>
          </div>
        </div>
        <div class="file-body">
          <div class="file-line"><span>📚</span><span>${S.BOOKS[app.signals.books]}</span></div>
          <div class="file-line"><span>🤝</span><span>${S.STANDING[app.signals.standing]}</span></div>
          <div class="file-line"><span>🏷️</span><span>Security covers about ${pct(app.security)} of it</span></div>
          <div class="file-line"><span>💰</span><span>${money(S.interestOf(app))} a week in interest,
            then ${whole(app.amount)} back at the end</span></div>
          <p class="file-remark">${S.REMARKS[app.signals.remark]}</p>
          ${app.extraReading != null
            ? `<p class="file-remark bought">${S.OPINIONS[app.extraReading]}</p>` : ''}
        </div>
      </div>

      <section class="card">
        <div class="row">
          <div class="row-main">
            <div class="row-name">Cash in the safe</div>
            <div class="row-sub">${affordable
              ? `${money(r.cash)} now, ${money(after)} if you write this`
              : `${money(r.cash)} — not enough for this one`}</div>
          </div>
          <div class="row-value ${affordable && after < needed ? 'bad' : ''}">${money(r.cash)}</div>
        </div>
        ${affordable && after < needed ? `
          <p class="muted small">${known
            ? `Writing this would leave you short of the ${money(needed)} the clearing house says is going out.`
            : `Writing this would leave you short of a bad week's withdrawals.`}</p>` : ''}
      </section>
    `,
    actions: `
      <div class="verdict-pair">
        <button class="btn approve" data-act="approve" ${affordable ? '' : 'disabled'}>
          ${affordable ? 'Approve' : 'Cannot fund'}
        </button>
        <button class="btn decline" data-act="decline">Decline</button>
      </div>`,
  };
}

/* ------------------------------------------------------------------ *
 * The week's close
 * ------------------------------------------------------------------ */

function report() {
  const r = store.run;
  const res = store.ui.pending;
  const done = r.phase === 'gameover';
  const drop = res.confidenceAfter - res.confidenceBefore;

  return {
    body: `
      <h1 class="title">Week ${res.week} <span class="of">closed</span></h1>
      <p class="sub">${res.written} written of ${res.seen} seen</p>

      <section class="facts">
        ${fact('Interest in', money(res.collected), 'good')}
        ${fact('Repaid', money(res.returned), 'good')}
        ${fact('Bad debt', money(res.badDebt), res.badDebt > 0 ? 'bad' : '')}
        ${fact('Capital', money(res.capital), res.capital >= r.stake ? 'good' : 'bad')}
      </section>

      <section class="card">
        <h2 class="card-title">The town's money</h2>
        <div class="row">
          <div class="row-main">
            <div class="row-name">${res.flow >= 0 ? 'Deposits taken in' : 'Withdrawn'}</div>
            <div class="row-sub">${res.shortfall > 0
              ? `You could only find ${money(res.paidOut)} of ${money(res.paidOut + res.shortfall)}`
              : 'Everyone who asked was paid'}</div>
          </div>
          <div class="row-value ${res.flow >= 0 ? 'good' : res.shortfall > 0 ? 'bad' : ''}">
            ${money(Math.abs(res.flow))}</div>
        </div>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Confidence</div>
            <div class="row-sub">${drop >= 0 ? 'Rebuilding, slowly' : 'Lost this week'}</div>
          </div>
          <div class="row-meter">${bar(res.confidenceAfter, res.confidenceAfter < 0.35 ? 'bar-bad' : '')}</div>
          <div class="row-value ${drop >= 0 ? 'good' : 'bad'}">${drop >= 0 ? '+' : ''}${Math.round(drop * 100)}</div>
        </div>
        <div class="row">
          <div class="row-main">
            <div class="row-name">Interest to depositors and the week's costs</div>
          </div>
          <div class="row-value bad">−${money(res.interest + res.overhead).replace('$', '$')}</div>
        </div>
      </section>

      ${res.defaults.length ? `
        <section class="card">
          <h2 class="card-title">Stopped paying</h2>
          ${res.defaults.map((d) => `
            <div class="row">
              <div class="row-main">
                <div class="row-name">${d.name}</div>
                <div class="row-sub">Written ${weeks(d.weeks)} ago · security found ${money(d.recovered)}</div>
              </div>
              <div class="row-value bad">−${money(d.outstanding - d.recovered).replace('$', '$')}</div>
            </div>`).join('')}
        </section>` : ''}

      <section class="card notes">
        <h2 class="card-title">Word about the town</h2>
        <ul>${res.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
      </section>
    `,
    actions: done
      ? `<button class="btn primary" data-act="closeReport">See the year</button>`
      : `<button class="btn primary" data-act="closeReport">Week ${r.week}</button>`,
  };
}

/* ------------------------------------------------------------------ *
 * The year's end
 * ------------------------------------------------------------------ */

function gameover() {
  const r = store.run;
  const score = S.finalScore(r);
  const inCampaign = Boolean(r.book);
  const won = score.won;
  const live = S.liveLoans(r);

  return {
    body: `
      <h1 class="title">${score.rank.icon} ${score.rank.title}</h1>
      <p class="sub">${r.book ? r.book.name : 'Free book'} — ${r.weeks} weeks</p>

      ${score.failed ? `
        <div class="verdict bad">${score.failed === 'run'
          ? 'Word got round that you could not pay, and by Friday there was a queue to the end of the street. The bank is closed.'
          : 'The capital was gone. The examiner wound the bank up.'}</div>` : ''}

      ${inCampaign && !score.failed ? `
        <div class="verdict ${won ? 'good' : 'bad'}">
          ${won
            ? `You cleared ${money(score.net)} against a target of ${whole(score.target)}. The book is yours.`
            : `You cleared ${money(score.net)}. The target was ${whole(score.target)}.`}
        </div>` : ''}

      <section class="facts">
        ${fact('Profit', money(score.net), score.net >= 0 ? 'good' : 'bad')}
        ${fact('Written', score.written)}
        ${fact('Declined', score.declined)}
        ${fact('Went bad', `${score.defaults}`, score.defaults ? 'bad' : 'good')}
      </section>

      <section class="card">
        <h2 class="card-title">How you lent</h2>
        <p>You wrote <strong>${score.written}</strong> of the ${score.written + score.declined} files
        that reached the desk. Of the ones that ran their course,
        <strong>${pct(score.badRate)}</strong> stopped paying.</p>
        ${live.length ? `<p class="muted small">${live.length} loan${live.length === 1 ? ' was' : 's were'}
          still running when the year closed, and ${live.length === 1 ? 'it counts' : 'they count'} at face value.</p>` : ''}
      </section>
    `,
    actions: inCampaign
      ? (won
          ? `<button class="btn primary" data-act="bankRun">Take the book</button>`
          : `<button class="btn primary" data-act="retryRun">Try again</button>
             <button class="btn" data-act="abandonRun">Back to the town</button>`)
      : `<button class="btn primary" data-act="abandonRun">Done</button>`,
  };
}

export const screens = { morning, desk, report, gameover };

/* ------------------------------------------------------------------ *
 * Actions
 * ------------------------------------------------------------------ */

/** Answer the file in front of you, then settle the week if that was the last. */
function answer(approve) {
  const r = store.run;
  const outcome = S.decide(r, approve);
  if (!outcome) return;

  store.ui.lastDecision = outcome.why
    ? outcome.why
    : outcome.approved
      ? `${outcome.app.name} — approved, ${whole(outcome.app.amount)} out of the safe.`
      : `${outcome.app.name} — turned away.`;

  if (r.phase === 'settle') settle();
}

/** Close the week: repayments, defaults, and whatever the town wants back. */
function settle() {
  const r = store.run;
  const result = S.settleWeek(r);
  S.commitWeek(r, result);
  store.ui.pending = result;
  store.ui.lastDecision = null;
}

export const actions = {
  openDesk() {
    S.openDesk(store.run);
    store.ui.lastDecision = null;
    if (store.run.phase === 'settle') settle();
  },

  approve() { answer(true); },
  decline() { answer(false); },

  closeReport() {
    store.ui.pending = null;
    store.ui.lastDecision = null;
  },

  /** Won it: bank the profit, tick the network, and go back to the town. */
  bankRun() {
    const r = store.run;
    const campaign = store.campaign;
    const score = S.finalScore(r);
    const { townId, index } = r.book;

    campaign.stats.runsPlayed += 1;
    campaign.stats.runsWon += 1;
    const change = C.holdBook(campaign, townId, index, score.net, score.written);
    recordBest(campaign.stats.loansWritten);

    // The network runs for exactly as long as you were out.
    store.ui.opsReport = campaign.ops ? runNetworkDays(campaign, r.weeks) : null;

    store.run = null;
    store.ui.pending = null;
    store.ui.view = 'town';
    store.ui.notice = change.opsJustUnlocked
      ? 'Five towns held. Time to open a branch and put a manager in.'
      : change.townJustDone
        ? `${C.getTown(townId).name} is all yours.`
        : null;
  },

  retryRun() {
    const { townId, index } = store.run.book;
    store.campaign.stats.runsPlayed += 1;
    startBook(townId, index);
  },

  abandonRun() {
    if (store.run?.book) store.campaign.stats.runsPlayed += 1;
    store.run = null;
    store.ui.pending = null;
    store.ui.view = store.campaign ? 'town' : 'title';
  },
};

/** Begin a book. Exported so the map can start one too. */
export function startBook(townId, bookIndex) {
  const config = C.runConfigFor(townId, bookIndex);
  const target = C.targetFor(store.campaign, townId, bookIndex);
  store.run = S.newRun({ ...config, target });
  store.ui.townId = townId;
  store.ui.bookIndex = bookIndex;
  store.ui.pending = null;
  store.ui.lastDecision = null;
  store.ui.view = 'run';
  render();
}
