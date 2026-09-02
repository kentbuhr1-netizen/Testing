import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.mjs';

const freshStore = () => {
  const dir = mkdtempSync(join(tmpdir(), 'purchases-'));
  const store = createStore(join(dir, 'nested', 'purchases.json'));
  return { store, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
};

test('a purchase survives being written and read back', () => {
  const { store, cleanup } = freshStore();
  try {
    store.record({ sessionId: 'cs_1', productId: 'bundle.all', email: 'a@b.com', code: 'AAAAA-BBBBB' });
    assert.equal(store.count(), 1);
    assert.equal(store.bySession('cs_1').productId, 'bundle.all');
    assert.equal(store.byCode('AAAAA-BBBBB').sessionId, 'cs_1');
    assert.equal(store.bySession('cs_missing'), null);
    assert.equal(store.byCode('NOPE'), null);
  } finally { cleanup(); }
});

test('a redelivered webhook does not double-record or reissue a code', () => {
  const { store, cleanup } = freshStore();
  try {
    const first = store.record({ sessionId: 'cs_1', productId: 'bundle.all', code: 'CODE1-CODE1' });
    const again = store.record({ sessionId: 'cs_1', productId: 'bundle.all', code: 'CODE2-CODE2' });
    assert.equal(store.count(), 1);
    assert.equal(again.code, first.code, 'a repeat delivery must not mint a second code');
    assert.equal(store.byCode('CODE2-CODE2'), null);
  } finally { cleanup(); }
});

test('codes are matched case- and space-insensitively, because people type them', () => {
  const { store, cleanup } = freshStore();
  try {
    store.record({ sessionId: 'cs_1', productId: 'bundle.all', code: 'ABCDE-FGHIJ' });
    assert.equal(store.byCode('abcde-fghij').sessionId, 'cs_1');
    assert.equal(store.byCode('  ABCDE-FGHIJ  ').sessionId, 'cs_1');
    assert.equal(store.byCode(null), null);
  } finally { cleanup(); }
});

test('everything one buyer owns can be found by their email', () => {
  const { store, cleanup } = freshStore();
  try {
    store.record({ sessionId: 'cs_1', productId: 'outbreak.full', email: 'Buyer@Example.com', code: 'A-A' });
    store.record({ sessionId: 'cs_2', productId: 'lemonade.full', email: 'buyer@example.com', code: 'B-B' });
    store.record({ sessionId: 'cs_3', productId: 'bundle.all', email: 'someone@else.com', code: 'C-C' });

    const owned = store.byEmail('BUYER@EXAMPLE.COM').map((p) => p.productId).sort();
    assert.deepEqual(owned, ['lemonade.full', 'outbreak.full']);
    assert.deepEqual(store.byEmail(null), []);
    assert.deepEqual(store.byEmail('nobody@nowhere.com'), []);
  } finally { cleanup(); }
});

test('a corrupt data file is survivable, not fatal', () => {
  const dir = mkdtempSync(join(tmpdir(), 'purchases-'));
  const file = join(dir, 'purchases.json');
  try {
    const store = createStore(file);
    store.record({ sessionId: 'cs_1', productId: 'bundle.all', code: 'A-A' });
    writeFileSync(file, '{ this is not json');
    const recovered = createStore(file);
    assert.equal(recovered.count(), 0);
    assert.doesNotThrow(() => recovered.record({ sessionId: 'cs_2', productId: 'bundle.all', code: 'B-B' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
