import { Router } from 'express';
import { getDb } from '../db/db.js';

export const queueRouter = Router();

// GET /api/queue - list queue items, optionally filtered by status/app
queueRouter.get('/', (req, res) => {
  const db = getDb();
  const { status, app_id: appId } = req.query;

  const clauses = [];
  const params = [];
  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }
  if (appId) {
    clauses.push('app_id = ?');
    params.push(appId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const items = db
    .prepare(`SELECT * FROM queue_items ${where} ORDER BY fetched_at DESC`)
    .all(...params);
  res.json(items);
});

// GET /api/queue/:id - single item detail + triage + response/fix history
queueRouter.get('/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM queue_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not found' });

  const triage = db
    .prepare('SELECT * FROM triage_results WHERE queue_item_id = ? ORDER BY id DESC')
    .all(item.id);
  const responses = db
    .prepare('SELECT * FROM responses WHERE queue_item_id = ? ORDER BY id DESC')
    .all(item.id);
  const fixTickets = db
    .prepare('SELECT * FROM fix_tickets WHERE queue_item_id = ? ORDER BY id DESC')
    .all(item.id);

  res.json({ ...item, triage, responses, fixTickets });
});
