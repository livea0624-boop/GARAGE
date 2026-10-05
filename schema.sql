-- Чистая схема нового GARAGE.
-- Паролей приложения здесь нет.
-- Все рабочие данные хранятся одним JSON-состоянием в D1.

CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
