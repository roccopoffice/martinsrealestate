CREATE TABLE bootstrap_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO bootstrap_lock (id, created_at)
SELECT 1, datetime('now') FROM employees LIMIT 1;
