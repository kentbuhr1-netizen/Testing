-- One row per app being tracked
CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY,
  name TEXT,
  platform TEXT, -- 'ios' or 'android'
  store_id TEXT, -- App Store or Play Store app identifier
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Raw items pulled from stores (reviews, crash reports)
CREATE TABLE IF NOT EXISTS queue_items (
  id INTEGER PRIMARY KEY,
  app_id INTEGER REFERENCES apps(id),
  source TEXT, -- 'review' or 'crash'
  external_id TEXT, -- store-assigned id, used to skip re-fetching the same item
  raw_content TEXT,
  rating INTEGER, -- null for crashes
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'new' -- new, triaged, responded, fixed, ignored
);

-- One row per (app, external_id) actually fetched, so a re-poll can skip it
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_items_app_external
  ON queue_items(app_id, source, external_id);

-- Triage classification results
CREATE TABLE IF NOT EXISTS triage_results (
  id INTEGER PRIMARY KEY,
  queue_item_id INTEGER REFERENCES queue_items(id),
  category TEXT, -- bug, feature_request, praise, spam, crash
  priority INTEGER, -- 1 (low) - 5 (urgent)
  classified_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Draft or sent responses
CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY,
  queue_item_id INTEGER REFERENCES queue_items(id),
  draft_text TEXT,
  auto_sent BOOLEAN DEFAULT 0,
  approved_by_kent BOOLEAN DEFAULT 0,
  sent_at DATETIME
);

-- Bug/fix tickets
CREATE TABLE IF NOT EXISTS fix_tickets (
  id INTEGER PRIMARY KEY,
  queue_item_id INTEGER REFERENCES queue_items(id),
  app_id INTEGER REFERENCES apps(id),
  description TEXT,
  status TEXT DEFAULT 'open', -- open, reproduced, patched, staged, approved, shipped
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Activity log (everything agents do, for audit/dashboard)
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY,
  agent_name TEXT,
  action TEXT,
  detail TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
