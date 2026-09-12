import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { getDb, resetDb } from '../db/db.js';
import { queueRouter } from '../routes/queue.js';

function freshApp() {
  resetDb();
  getDb(':memory:');
  const app = express();
  app.use('/api/queue', queueRouter);
  return app;
}

async function json(app, path) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://localhost:${port}${path}`);
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

test('an empty queue returns an empty list, not an error', async () => {
  const app = freshApp();
  const { status, body } = await json(app, '/api/queue');
  assert.equal(status, 200);
  assert.deepEqual(body, []);
});

test('the queue list can be filtered by status', async () => {
  const app = freshApp();
  const db = getDb();
  db.prepare("INSERT INTO apps (name, platform, store_id) VALUES ('Outbreak', 'ios', '1')").run();
  db.prepare(
    "INSERT INTO queue_items (app_id, source, external_id, raw_content, status) VALUES (1, 'review', 'a', 'x', 'new')"
  ).run();
  db.prepare(
    "INSERT INTO queue_items (app_id, source, external_id, raw_content, status) VALUES (1, 'review', 'b', 'y', 'triaged')"
  ).run();

  const { body } = await json(app, '/api/queue?status=triaged');
  assert.equal(body.length, 1);
  assert.equal(body[0].external_id, 'b');
});

test('a single queue item includes its triage, response and fix history', async () => {
  const app = freshApp();
  const db = getDb();
  db.prepare("INSERT INTO apps (name, platform, store_id) VALUES ('Outbreak', 'ios', '1')").run();
  db.prepare(
    "INSERT INTO queue_items (app_id, source, external_id, raw_content) VALUES (1, 'review', 'a', 'crashes on launch')"
  ).run();
  db.prepare(
    "INSERT INTO triage_results (queue_item_id, category, priority) VALUES (1, 'crash', 5)"
  ).run();

  const { status, body } = await json(app, '/api/queue/1');
  assert.equal(status, 200);
  assert.equal(body.raw_content, 'crashes on launch');
  assert.equal(body.triage.length, 1);
  assert.equal(body.triage[0].category, 'crash');
  assert.deepEqual(body.responses, []);
  assert.deepEqual(body.fixTickets, []);
});

test('an unknown queue item id returns 404', async () => {
  const app = freshApp();
  const { status, body } = await json(app, '/api/queue/999');
  assert.equal(status, 404);
  assert.deepEqual(body, { error: 'not found' });
});
