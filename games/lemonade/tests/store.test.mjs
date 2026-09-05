import test from 'node:test';
import assert from 'node:assert/strict';

/* store.js touches localStorage at module scope, so a shim goes in before it loads. */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { store, save, loadSave, clearSave, bestScore } = await import('../js/store.js');
const S = await import('../js/sim.js');
const C = await import('../js/campaign.js');

const fresh = () => { clearSave(); store.campaign = null; store.run = null; store.ui.pending = null; store.ui.view = 'title'; };

test('a Free Play run with no campaign is saved and can be resumed', () => {
  fresh();
  store.run = S.newRun({ seed: 7 });
  store.ui.view = 'run';
  save();
  const saved = loadSave();
  assert.ok(saved, 'the run was written');
  assert.equal(saved.campaign, null);
  assert.equal(saved.run.seed, 7);
});

test('the simulated day survives a save left on the report screen', () => {
  fresh();
  const run = S.newRun({ seed: 11 });
  store.run = run;
  store.ui.pending = S.simulateDay(run);
  run.phase = 'report';
  store.ui.view = 'run';
  save();
  const saved = loadSave();
  assert.ok(saved.pending, 'pending was persisted');
  assert.equal(saved.pending.day, run.day);
});

test('a save is never left pointing at the title, so Continue always goes somewhere', () => {
  fresh();
  store.campaign = C.newCampaign();
  store.ui.view = 'title';
  save();
  assert.equal(loadSave().view, 'world');
  store.ui.view = 'freePlayPick';
  save();
  assert.equal(loadSave().view, 'world');
});

test('bestScore degrades to 0 when storage throws instead of taking the title down', () => {
  const real = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} };
  assert.equal(bestScore(), 0);
  globalThis.localStorage = real;
});
