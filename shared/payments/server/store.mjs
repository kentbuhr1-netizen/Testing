/**
 * Where purchases are remembered.
 *
 * A JSON file, written atomically, which is genuinely enough for a couple of
 * games selling a one-off unlock: the whole record is a few hundred bytes per
 * buyer and it is only read when someone reinstalls. Swap `readAll`/`writeAll`
 * for a real database the day that stops being true — nothing else changes.
 */
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

export function createStore(file) {
  mkdirSync(dirname(file), { recursive: true });

  const readAll = () => {
    if (!existsSync(file)) return { purchases: {}, byCode: {} };
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return { purchases: {}, byCode: {} };
    }
  };

  const writeAll = (data) => {
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(data, null, 2));
    renameSync(temporary, file);            // atomic, so a crash cannot truncate it
  };

  return {
    /** Record a completed purchase. Idempotent: webhooks are delivered more than once. */
    record({ sessionId, productId, email, code, createdAt = Date.now() }) {
      const data = readAll();
      const existing = data.purchases[sessionId];
      if (existing) return existing;

      const purchase = { sessionId, productId, email: email || null, code, createdAt };
      data.purchases[sessionId] = purchase;
      data.byCode[code] = sessionId;
      writeAll(data);
      return purchase;
    },

    bySession(sessionId) {
      return readAll().purchases[sessionId] || null;
    },

    byCode(code) {
      const data = readAll();
      const sessionId = data.byCode[String(code || '').toUpperCase().trim()];
      return sessionId ? data.purchases[sessionId] || null : null;
    },

    /** Everything one email has ever bought, so a licence can carry the lot. */
    byEmail(email) {
      if (!email) return [];
      const wanted = String(email).toLowerCase().trim();
      return Object.values(readAll().purchases)
        .filter((p) => (p.email || '').toLowerCase() === wanted);
    },

    count() {
      return Object.keys(readAll().purchases).length;
    },
  };
}
