
CREATE TABLE IF NOT EXISTS body_param (
  body_id TEXT NOT NULL REFERENCES body(id),
  param TEXT NOT NULL,
  value_num REAL,
  value_text TEXT,
  unit TEXT,
  source TEXT,
  PRIMARY KEY (body_id, param)
);

-- данные: db/galaktika.db, таблица body_param
