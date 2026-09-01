/** Small rendering helpers shared by every screen. */
import { TIERS } from '../campaign.js';

export const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
export const whole = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n))}`;
export const cents = (n) => `${Math.round(n * 100)}¢`;

export function fact(label, value, cls = '') {
  return `<div class="fact"><div class="fact-label">${label}</div><div class="fact-value ${cls}">${value}</div></div>`;
}

export function tierPill(tier) {
  const t = TIERS[tier];
  return `<span class="pill pill-${tier}">${t.icon} ${t.label}</span>`;
}

export function bar(fraction, cls = '') {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return `<span class="bar ${cls}"><i style="width:${pct.toFixed(1)}%"></i></span>`;
}

/**
 * A plus/minus control. `group` and `field` route the tap back to a handler;
 * every screen re-renders on change, so the buttons are always in step.
 */
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

export function backBar(label, act, extra = '') {
  return `<button class="crumb" data-act="${act}" ${extra}>‹ ${label}</button>`;
}
