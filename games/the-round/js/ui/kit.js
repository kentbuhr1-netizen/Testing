/** Small rendering helpers shared by every screen. */
import { TIERS } from '../campaign.js';
import { MAP_SIZE, DEPOT } from '../sim.js';

export const money = (n) => `${n < 0 ? '-' : ''}$${Math.abs(n).toFixed(2)}`;
export const whole = (n) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n))}`;
export const pct = (n) => `${Math.round(n * 100)}%`;

/** Minutes as the hours-and-minutes a person would actually say. */
export function clock(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

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
 * The round, drawn.
 *
 * The whole game is a routing problem, so seeing the shape of it — who is out
 * on their own, which cluster is worth a trip — is not decoration. The route
 * you have built so far is drawn over the top in order.
 */
/**
 * The round, drawn as the loop you have built.
 *
 * With `interactive`, the lawns themselves are the control: the game is a
 * routing problem, so choosing stops off a map rather than a list is the
 * whole point. The visible dots are far too small to tap on a phone, and a
 * generous target over each one steals its neighbours' taps in a tight round,
 * so the whole map takes the tap and the handler picks the nearest lawn to it.
 * The list beside the map does everything this does — it is the keyboard and
 * screen-reader path, which is why the drawing stays out of the
 * accessibility tree.
 */
export function roundMap(properties, route, options = {}) {
  const pad = 6;
  const size = MAP_SIZE + pad * 2;
  const at = (p) => ({ x: p.x + pad, y: p.y + pad });
  const depot = at(DEPOT);

  const line = route.length
    ? [DEPOT, ...route.map((id) => properties[id]).filter(Boolean), DEPOT]
        .map((p) => { const q = at(p); return `${q.x.toFixed(1)},${q.y.toFixed(1)}`; })
        .join(' ')
    : '';

  const shown = properties.filter((p) => p.active);
  const radius = (p) => 2.2 + Math.min(3, p.size / 4);

  const dots = shown.map((p) => {
    const q = at(p);
    const step = route.indexOf(p.id);
    const cls = step >= 0 ? 'on-route'
      : options.due && options.due(p) ? 'due'
      : 'idle';
    const risk = p.patience < 0.3 ? ' at-risk' : '';
    return `<circle class="lawn ${cls}${risk}" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${radius(p).toFixed(1)}" />` +
      (step >= 0 ? `<text class="lawn-step" x="${q.x.toFixed(1)}" y="${(q.y + 2.4).toFixed(1)}">${step + 1}</text>` : '');
  }).join('');

  const hits = options.interactive
    ? `<rect class="map-hit" data-act="mapPick" x="0" y="0" width="${size}" height="${size}" />`
    : '';

  return `
    <svg class="map${options.interactive ? ' map-live' : ''}" viewBox="0 0 ${size} ${size}"
         aria-hidden="true" focusable="false">
      ${line ? `<polyline class="route" points="${line}" />` : ''}
      ${dots}
      <rect class="depot" x="${(depot.x - 3).toFixed(1)}" y="${(depot.y - 3).toFixed(1)}" width="6" height="6" rx="1.5" />
      ${hits}
    </svg>`;
}
