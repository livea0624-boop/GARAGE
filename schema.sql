CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS garage_auth (
  id INTEGER PRIMARY KEY,
  login_hash TEXT NOT NULL,
  action_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
