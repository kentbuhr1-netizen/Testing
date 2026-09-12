import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || join(__dirname, 'pipeline.sqlite');

let db;

// Opens (creating if needed) the pipeline database and makes sure the schema
// exists. Safe to call more than once — schema.sql is all CREATE TABLE IF NOT EXISTS.
// Pass path=':memory:' (tests do) to get a fresh, isolated database.
export function getDb(path = DB_PATH) {
  if (db) return db;
  db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}

// Test-only: drops the cached connection so the next getDb() call opens fresh.
export function resetDb() {
  if (db) db.close();
  db = undefined;
}

export function logActivity(agentName, action, detail) {
  getDb()
    .prepare('INSERT INTO activity_log (agent_name, action, detail) VALUES (?, ?, ?)')
    .run(agentName, action, detail == null ? null : String(detail));
}
