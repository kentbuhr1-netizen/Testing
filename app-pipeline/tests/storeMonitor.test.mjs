import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, resetDb } from '../db/db.js';
import { runStoreMonitor } from '../agents/storeMonitor.js';

function freshDb() {
  resetDb();
  return getDb(':memory:');
}

test('a new review lands in the queue as an untriaged item', async () => {
  const db = freshDb();
  db.prepare("INSERT INTO apps (name, platform, store_id) VALUES ('Outbreak', 'ios', '123')").run();

  const fetchers = {
    ios: async () => [{ externalId: 'r1', rating: 5, content: 'love it', createdAt: null }],
  };

  const result = await runStoreMonitor(fetchers);

  assert.equal(result.inserted, 1);
  const items = db.prepare('SELECT * FROM queue_items').all();
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'new');
  assert.equal(items[0].source, 'review');
  assert.equal(items[0].rating, 5);
});

test('polling twice never queues the same review twice', async () => {
  const db = freshDb();
  db.prepare("INSERT INTO apps (name, platform, store_id) VALUES ('Outbreak', 'ios', '123')").run();

  const fetchers = {
    ios: async () => [{ externalId: 'r1', rating: 5, content: 'love it', createdAt: null }],
  };

  await runStoreMonitor(fetchers);
  const second = await runStoreMonitor(fetchers);

  assert.equal(second.inserted, 0);
  const items = db.prepare('SELECT * FROM queue_items').all();
  assert.equal(items.length, 1);
});

test('an app on an unrecognized platform is skipped, not crashed on', async () => {
  const db = freshDb();
  db.prepare("INSERT INTO apps (name, platform, store_id) VALUES ('Mystery', 'windows_phone', '999')").run();

  const result = await runStoreMonitor({});

  assert.equal(result.appsPolled, 1);
  assert.equal(result.inserted, 0);
  const skipLog = db
    .prepare("SELECT * FROM activity_log WHERE agent_name = 'storeMonitor' AND action = 'skip'")
    .get();
  assert.ok(skipLog);
});

test('a store API failure for one app is logged and does not stop the others', async () => {
  const db = freshDb();
  db.prepare("INSERT INTO apps (name, platform, store_id) VALUES ('Flaky', 'ios', '1')").run();
  db.prepare("INSERT INTO apps (name, platform, store_id) VALUES ('Fine', 'android', '2')").run();

  const fetchers = {
    ios: async () => {
      throw new Error('boom');
    },
    android: async () => [{ externalId: 'a1', rating: 3, content: 'meh', createdAt: null }],
  };

  const result = await runStoreMonitor(fetchers);

  assert.equal(result.inserted, 1);
  const errorLog = db
    .prepare("SELECT * FROM activity_log WHERE agent_name = 'storeMonitor' AND action = 'error'")
    .get();
  assert.ok(errorLog);
  assert.match(errorLog.detail, /boom/);
});
