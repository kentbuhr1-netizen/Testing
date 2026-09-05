import test from 'node:test';
import assert from 'node:assert/strict';
import { createBonusCore } from '../client/core.js';

/** A stand-in for localStorage that behaves, so the tests can watch what is kept. */
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
  };
}

/** A storage that throws on every call, like a browser with site data blocked. */
const hostileStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
};

function setup({ storage = fakeStorage(), available = () => ({ ok: true }), cooldownMs = 1000 } = {}) {
  const applied = [];
  const core = createBonusCore({
    storageKey: 'test-bonuses',
    cooldownMs,
    storage,
    bonuses: [
      { id: 'cash', icon: '💰', title: 'Cash', describe: () => '+$15', available, apply: () => applied.push('cash') },
      { id: 'ice', icon: '🧊', title: 'Ice', describe: () => '+30 ice', available: () => ({ ok: true }), apply: () => applied.push('ice') },
    ],
  });
  return { core, applied, storage };
}

test('a fresh bonus is ready and claiming it runs apply exactly once', () => {
  const { core, applied } = setup();
  assert.equal(core.status('cash', 0).state, 'ready');

  const result = core.claim('cash', 0);
  assert.equal(result.claimed, true);
  assert.equal(result.bonus.id, 'cash');
  assert.deepEqual(applied, ['cash']);
});

test('a claimed bonus goes on cooldown and reports the time left', () => {
  const { core } = setup({ cooldownMs: 1000 });
  core.claim('cash', 0);

  const during = core.status('cash', 400);
  assert.equal(during.state, 'cooldown');
  assert.equal(during.waitMs, 600);
});

test('claiming again during the cooldown is refused and does not re-apply', () => {
  const { core, applied } = setup({ cooldownMs: 1000 });
  core.claim('cash', 0);

  const second = core.claim('cash', 400);
  assert.equal(second.claimed, false);
  assert.equal(second.reason, 'cooldown');
  assert.deepEqual(applied, ['cash'], 'apply must not run a second time');
});

test('the cooldown expires exactly at the boundary, not a tick later', () => {
  const { core } = setup({ cooldownMs: 1000 });
  core.claim('cash', 0);

  assert.equal(core.status('cash', 999).state, 'cooldown');
  assert.equal(core.status('cash', 1000).state, 'ready');
});

test('cooldowns are per bonus, not shared across the shop', () => {
  const { core } = setup({ cooldownMs: 1000 });
  core.claim('cash', 0);

  assert.equal(core.status('cash', 100).state, 'cooldown');
  assert.equal(core.status('ice', 100).state, 'ready', 'one claim must not lock the whole shop');
});

test('an unavailable bonus reports why, and unavailability outranks cooldown', () => {
  const { core, applied } = setup({ available: () => ({ ok: false, why: 'Start a run first.' }) });

  const state = core.status('cash', 0);
  assert.equal(state.state, 'unavailable');
  assert.equal(state.why, 'Start a run first.');

  const result = core.claim('cash', 0);
  assert.equal(result.claimed, false);
  assert.equal(result.reason, 'unavailable');
  assert.deepEqual(applied, [], 'an unavailable bonus must never apply');
});

test('availability is re-checked at claim time, not at display time', () => {
  let ok = true;
  const { core, applied } = setup({ available: () => (ok ? { ok: true } : { ok: false, why: 'run ended' }) });

  assert.equal(core.status('cash', 0).state, 'ready');
  ok = false; // the run ends while the ad is playing
  assert.equal(core.claim('cash', 0).claimed, false);
  assert.deepEqual(applied, []);
});

test('an unknown id is refused rather than throwing', () => {
  const { core } = setup();
  assert.equal(core.status('nope', 0).state, 'unknown');
  assert.equal(core.claim('nope', 0).claimed, false);
});

test('cooldowns persist through the storage that was handed in', () => {
  const storage = fakeStorage();
  const first = setup({ storage, cooldownMs: 1000 });
  first.core.claim('cash', 0);

  const second = setup({ storage, cooldownMs: 1000 }); // a "reload" over the same storage
  assert.equal(second.core.status('cash', 400).state, 'cooldown');
});

test('storage that throws degrades to no cooldowns rather than breaking the shop', () => {
  const { core, applied } = setup({ storage: hostileStorage, cooldownMs: 1000 });

  assert.equal(core.status('cash', 0).state, 'ready');
  assert.equal(core.claim('cash', 0).claimed, true, 'a claim must still work with storage denied');
  assert.deepEqual(applied, ['cash']);
  assert.equal(core.status('cash', 1).state, 'ready', 'without storage the cooldown simply cannot be kept');
});

test('corrupt stored JSON is survivable, not fatal', () => {
  const storage = fakeStorage({ 'test-bonuses': '{not json' });
  const { core } = setup({ storage });
  assert.equal(core.status('cash', 0).state, 'ready');
});
