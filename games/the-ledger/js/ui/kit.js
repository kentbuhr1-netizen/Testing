/** Small rendering helpers shared by every screen. */
import { TIERS } from '../campaign.js';

export const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
export const whole = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
export const pct = (n) => `${Math.round(n * 100)}%`;
/** A rate you can actually do sums with — whole percents are too coarse. */
export const rate = (n) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;

/** A term in the words a person would use. */
export const weeks = (n) => `${n} week${n === 1 ? '' : 's'}`;

export function fact(label, value, cls = '') {
  return `<div class="fact"><div class="fact-label">${label}</div><div class="fact-value ${cls}">${value}</div></div>`;
}

export function tierPill(tier) {
  const t = TIERS[tier];
  return `<span class="pill pill-${tier}">${t.icon} ${t.label}</span>`;
}

export function bar(fraction, cls = '') {
  const width = Math.max(0, Math.min(1, fraction)) * 100;
  return `<span class="bar ${cls}"><i style="width:${width.toFixed(1)}%"></i></span>`;
}

export function row(name, sub, control) {
  return `
    <div class="row">
      <div class="row-main">
        <div class="row-name">${name}</div>
        ${sub ? `<div class="row-sub">${sub}</div>` : ''}
      </div>
      ${control || ''}
    </div>`;
}

export function stepper(group, field, value, step, min, max, display) {
  const shown = display ?? value;
  return `
    <div class="stepper">
      <button data-act="step" data-group="${group}" data-field="${field}" data-step="${-step}"
              ${value <= min ? 'disabled' : ''} aria-label="Less ${field}">−</button>
      <output>${shown}</output>
      <button data-act="step" data-group="${group}" data-field="${field}" data-step="${step}"
              ${value >= max ? 'disabled' : ''} aria-label="More ${field}">+</button>
    </div>`;
}

export function backBar(label, act, extra = '') {
  return `<button class="crumb" data-act="${act}" ${extra}>‹ ${label}</button>`;
}

/**
 * The balance sheet.
 *
 * Both halves matter and they fail differently: the capital line is whether
 * you are solvent, the reserve gauge underneath is whether you can pay
 * anybody today. A bank can die of either.
 */
export function balanceSheet(cash, book, deposits, capital, forecast) {
  const cover = forecast && forecast.high > 0 ? cash / forecast.high : null;
  return `
    <div class="sheet">
      <div class="sheet-row"><span class="sheet-label">Cash in the safe</span><span>${money(cash)}</span></div>
      <div class="sheet-row"><span class="sheet-label">Out on loan</span><span>${money(book)}</span></div>
      <div class="sheet-row"><span class="sheet-label">Owed to depositors</span><span>−${money(deposits).replace('$', '$')}</span></div>
      <div class="sheet-row total"><span class="sheet-label">Capital</span>
        <span class="${capital >= 0 ? '' : 'bad'}">${money(capital)}</span></div>
      ${forecast ? `
        <div class="gauge">
          <div class="gauge-head">
            <span>Cash against a bad week</span>
            <span>${cover == null ? 'nothing expected out' : `${Math.round(Math.min(cover, 9) * 100)}%`}</span>
          </div>
          ${bar(cover == null ? 1 : Math.min(1, cover), cover != null && cover < 1 ? 'bar-bad' : '')}
        </div>` : ''}
    </div>`;
}

/** Where you are in this week's queue, without showing what is still in it. */
export function queueDots(total, at) {
  const dots = Array.from({ length: Math.min(total, 12) }, (_, i) =>
    `<i class="${i < at ? 'done' : i === at ? 'now' : ''}"></i>`).join('');
  const left = total - at;
  return `
    <div class="queue">
      <span class="queue-dots">${dots}</span>
      <span>${left <= 1 ? 'last one this week' : `${left - 1} more waiting behind this one`}</span>
    </div>`;
}
