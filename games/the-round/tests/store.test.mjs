import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { loadSave } = await import('../js/store.js');
const SAVE_KEY = 'the-round-campaign-v1';
const C = await import('../js/campaign.js');
const S = await import('../js/sim.js');

test('migrating an old save re-measures the round that was in progress, not just the cached ones', () => {
  const campaign = C.newCampaign();
  const town = C.TOWNS[0].id;
  const run = S.newRun({ ...C.runConfigFor(town, 0), target: 999999 });   // a bar from the old model
  mem.set(SAVE_KEY, JSON.stringify({ version: 1, campaign: { ...campaign, targets: { [`${town}:0`]: 999999 } }, run, view: 'run' }));
  const data = loadSave();
  assert.ok(data, 'the save still loads');
  assert.notEqual(data.run.target, 999999, 'the in-progress round no longer carries the old bar');
  assert.equal(data.run.target, C.targetFor(data.campaign, town, 0), 'it is the same bar every other round gets');
});
