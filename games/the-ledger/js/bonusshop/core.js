/* Copied from shared/bonusshop/client/core.js by tools/sync-payments.mjs — edit the shared copy, not this one. */
/**
 * The Bonus Shop, minus the screen: which bonuses can be claimed right now,
 * and what claiming one does.
 *
 * Kept DOM-free and injectable so it can be tested from node without a
 * browser, and so a game can swap in a fake clock or a fake storage. The
 * screen that draws all this lives in `shell.js`.
 *
 * A game supplies its own bonuses. Each one is:
 *
 *   {
 *     id,                       // stable; it is the cooldown key
 *     icon, title,
 *     describe: () => string,   // called fresh each render, so it can show live numbers
 *     available: () => ({ ok: true } | { ok: false, why: string }),
 *     apply: () => void,        // grant it; only ever called when available and off cooldown
 *   }
 */

/** Storage that never throws: private mode and a full quota both degrade to "no cooldowns kept". */
function safeStorage(given) {
  if (given) return given;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null; // some browsers throw on merely touching localStorage
  }
}

export function createBonusCore({ bonuses, storageKey, cooldownMs = 60_000, storage, now = () => Date.now() }) {
  const store = safeStorage(storage);

  function loadClaims() {
    try {
      return JSON.parse(store?.getItem(storageKey)) || {};
    } catch {
      return {};
    }
  }

  function markClaimed(id, at = now()) {
    try {
      const claims = loadClaims();
      claims[id] = at;
      store?.setItem(storageKey, JSON.stringify(claims));
    } catch {
      /* the cooldown just won't survive a reload — not worth failing a claim over */
    }
  }

  const find = (id) => bonuses.find((b) => b.id === id);
  /**
   * When this bonus next becomes claimable. A bonus that has never been
   * claimed is ready now — not `cooldownMs` after the epoch, which is the
   * same thing only as long as the clock is a real wall clock.
   */
  function readyAt(id) {
    const lastClaimed = loadClaims()[id];
    // Never claimed is `undefined`, not `0` — a claim at timestamp 0 is a real
    // claim, so this cannot be a truthiness check.
    return lastClaimed == null ? 0 : lastClaimed + cooldownMs;
  }

  /**
   * Why a bonus is or is not claimable, in the order the player cares about:
   * "you can't use this yet" beats "you used it a moment ago".
   */
  function status(id, at = now()) {
    const bonus = find(id);
    if (!bonus) return { state: 'unknown' };

    const avail = bonus.available();
    if (!avail.ok) return { state: 'unavailable', why: avail.why };

    const waitMs = Math.max(0, readyAt(id) - at);
    return waitMs > 0 ? { state: 'cooldown', waitMs } : { state: 'ready' };
  }

  /** Grant a bonus, but only if it is genuinely claimable — never trust the caller. */
  function claim(id, at = now()) {
    const bonus = find(id);
    const state = status(id, at);
    if (state.state !== 'ready') return { claimed: false, reason: state.state };

    bonus.apply();
    markClaimed(id, at);
    return { claimed: true, bonus };
  }

  return { bonuses, find, status, claim, readyAt, markClaimed, cooldownMs };
}
