/** Small rendering helpers shared by every screen. */
import { store } from '../store.js';

const SUFFIXES = [
  [1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'],
];

/** Compact money, the way an idle game has to: $1.2M rather than $1,234,567.89. */
export function money(n) {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return `${sign}$${abs.toFixed(abs < 10 ? 2 : 1)}`;
  for (const [value, suffix] of SUFFIXES) {
    if (abs >= value) return `${sign}$${(abs / value).toFixed(2)}${suffix}`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

export const count = (n) => money(n).replace('$', '');
export const pct = (n) => `${Math.round(n * 100)}%`;

export function fact(label, value, cls = '') {
  return `<div class="fact"><div class="fact-label">${label}</div><div class="fact-value ${cls}">${value}</div></div>`;
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

export function backBar(label, act, extra = '') {
  return `<button class="crumb" data-act="${act}" ${extra}>‹ ${label}</button>`;
}

/** The one-time "welcome back" notice after time away is credited. */
export function offlineFlash() {
  const report = store.ui.offlineReport;
  store.ui.offlineReport = null;
  if (!report) return '';
  const hours = Math.floor(report.seconds / 3600);
  const minutes = Math.round((report.seconds % 3600) / 60);
  const away = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return `<div class="notice">Welcome back. The floor kept running for ${away} while you were away: ${money(report.earned)} earned.</div>`;
}
