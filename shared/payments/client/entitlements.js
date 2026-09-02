/**
 * What this player has paid for.
 *
 * The whole module is designed to fail *closed on claims* and *open on
 * outages*: an unverifiable licence unlocks nothing, but a licence that has
 * already been verified keeps working forever with the server switched off.
 * A paid game must never stop working because a host went down.
 */
import { verifyLicence } from './licence.js';
import { unlocks, FREE_TIER } from '../catalog.js';

const LICENCE_KEY = 'game-licence-v1';
const CODE_KEY = 'game-licence-code-v1';

const settings = {
  apiBase: null,        // e.g. 'https://payments.example.com'
  publicKey: null,      // the LICENCE_PUBLIC_KEY the server printed
  game: null,           // 'outbreak' | 'lemonade'
};

let state = { ready: false, products: [], subject: null, code: null };

/** Call once at startup, before the first render. */
export function configure(options) {
  Object.assign(settings, options);
}

const readStored = (key) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const writeStored = (key, value) => {
  try { localStorage.setItem(key, value); } catch { /* private mode: this session only */ }
};

async function adopt(token) {
  const result = await verifyLicence(token, settings.publicKey);
  if (!result.ok) return false;
  writeStored(LICENCE_KEY, token);
  state = {
    ready: true,
    products: result.licence.products || [],
    subject: result.licence.sub || null,
    code: readStored(CODE_KEY),
  };
  return true;
}

/**
 * Load whatever we already have, and pick up a licence if the player has just
 * come back from Stripe. Never throws: an offline start is a normal start.
 */
export async function init() {
  const stored = readStored(LICENCE_KEY);
  if (stored) await adopt(stored);
  state.ready = true;
  state.code = readStored(CODE_KEY);

  // Returning from checkout: ?session_id=cs_...
  try {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    if (sessionId && settings.apiBase) {
      const response = await fetch(`${settings.apiBase}/api/licence?session_id=${encodeURIComponent(sessionId)}`);
      if (response.ok) {
        const { licence, code } = await response.json();
        if (await adopt(licence)) {
          if (code) { writeStored(CODE_KEY, code); state.code = code; }
        }
      }
      // Clear the query either way, so a refresh is not a second lookup.
      history.replaceState(null, '', location.pathname + location.hash);
    }
  } catch { /* offline, or the server is down: the cached licence still stands */ }

  return state;
}

/** Redeem a recovery code on a new device. */
export async function redeem(code) {
  if (!settings.apiBase) return { ok: false, why: 'Purchases are not configured.' };
  let response;
  try {
    response = await fetch(`${settings.apiBase}/api/licence/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: String(code || '').toUpperCase().trim() }),
    });
  } catch {
    return { ok: false, why: 'Could not reach the server. Try again when you are online.' };
  }
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    return { ok: false, why: error || 'That code did not work.' };
  }
  const { licence, code: issued } = await response.json();
  if (!(await adopt(licence))) return { ok: false, why: 'That licence did not verify.' };
  if (issued) { writeStored(CODE_KEY, issued); state.code = issued; }
  return { ok: true };
}

/** Send the player to Stripe. Returns a reason string if it could not start. */
export async function buy(productId, { successUrl, cancelUrl } = {}) {
  if (!settings.apiBase) return { ok: false, why: 'Purchases are not configured yet.' };
  let response;
  try {
    response = await fetch(`${settings.apiBase}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        successUrl: successUrl || location.href.split('?')[0],
        cancelUrl: cancelUrl || location.href.split('?')[0],
      }),
    });
  } catch {
    return { ok: false, why: 'Could not reach the shop. Are you online?' };
  }
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({}));
    return { ok: false, why: error || 'Could not start checkout.' };
  }
  const { url } = await response.json();
  location.href = url;                   // Stripe hosts the card form, not us
  return { ok: true };
}

/**
 * Is this game unlocked?
 *
 * A build with no shop configured is the *complete* game — that is what makes
 * the repository worth cloning, and a half-game is no use to anyone running it
 * themselves. Gating switches on only once `configure()` has been given a real
 * `apiBase` and `publicKey`, which is what the build you host will have.
 */
export const owns = (game = settings.game) => !configured() || unlocks(state.products, game);

/** What the licence actually says, ignoring the unconfigured-build rule. */
export const purchased = (game = settings.game) => unlocks(state.products, game);
export const products = () => [...state.products];
export const recoveryCode = () => state.code;
export const configured = () => Boolean(settings.apiBase && settings.publicKey);

/** How much of this game is playable without paying. */
export const freeTier = (game = settings.game) => FREE_TIER[game] || {};

/** For tests and for a "restore purchases" button that needs to start clean. */
export function forget() {
  try {
    localStorage.removeItem(LICENCE_KEY);
    localStorage.removeItem(CODE_KEY);
  } catch { /* ignore */ }
  state = { ready: true, products: [], subject: null, code: null };
}
