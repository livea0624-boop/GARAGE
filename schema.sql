-- Чистая схема нового GARAGE.
-- Паролей приложения здесь нет.
-- Все рабочие данные хранятся одним JSON-состоянием в D1.

CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Ежедневные замеры размера D1 для прогноза заполнения бесплатного лимита.
CREATE TABLE IF NOT EXISTS hosting_usage_samples (
  sample_day TEXT PRIMARY KEY,
  database_bytes INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
