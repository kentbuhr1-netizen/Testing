// Store Monitor: pure data collection. Polls each tracked app's store API
// for reviews and writes new ones into queue_items. No classification, no
// decisions — that's Triage's job.
import { getDb, logActivity } from '../db/db.js';
import * as appStoreApi from '../lib/appStoreApi.js';
import * as playStoreApi from '../lib/playStoreApi.js';

const FETCHERS = {
  ios: appStoreApi.fetchReviews,
  android: playStoreApi.fetchReviews,
};

// Runs one poll across every tracked app. Returns how many new items were
// queued, so callers (the scheduler, the manual API route) can report it.
// `fetchers` is overridable so tests can stand in for the real store APIs.
export async function runStoreMonitor(fetchers = FETCHERS) {
  const db = getDb();
  const apps = db.prepare('SELECT * FROM apps').all();
  const insertItem = db.prepare(
    `INSERT OR IGNORE INTO queue_items (app_id, source, external_id, raw_content, rating)
     VALUES (?, 'review', ?, ?, ?)`
  );

  let inserted = 0;

  for (const app of apps) {
    const fetchReviews = fetchers[app.platform];
    if (!fetchReviews) {
      logActivity('storeMonitor', 'skip', `${app.name}: unknown platform "${app.platform}"`);
      continue;
    }

    try {
      const reviews = await fetchReviews(app.store_id);
      let newForApp = 0;
      for (const review of reviews) {
        const result = insertItem.run(app.id, review.externalId, review.content, review.rating);
        if (result.changes > 0) newForApp += 1;
      }
      inserted += newForApp;
      logActivity('storeMonitor', 'poll', `${app.name}: fetched ${reviews.length} reviews, ${newForApp} new`);
    } catch (err) {
      logActivity('storeMonitor', 'error', `${app.name}: ${err.message}`);
    }
  }

  return { appsPolled: apps.length, inserted };
}
