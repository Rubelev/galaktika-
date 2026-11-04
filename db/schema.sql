
PRAGMA foreign_keys = ON;

-- ===== КАТАЛОГ ТИПОВ =====
CREATE TABLE IF NOT EXISTS system_type (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, purpose TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS body_type (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,   -- star|planet|moon|belt|portal
  can_land INTEGER DEFAULT 0, can_build INTEGER DEFAULT 0,
  has_atmosphere INTEGER DEFAULT 0, base_gravity REAL, base_temp_c REAL,
  params_json TEXT
);
CREATE TABLE IF NOT EXISTS ship_class (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  accel_km_s2 REAL NOT NULL, vmax_c REAL NOT NULL, hp INTEGER, cargo_t REAL,
  role TEXT, params_json TEXT
);
CREATE TABLE IF NOT EXISTS module_type (
  id TEXT PRIMARY KEY, slot TEXT NOT NULL, name TEXT NOT NULL,
  vmax_delta REAL DEFAULT 0, accel_delta REAL DEFAULT 0, heat_delta REAL DEFAULT 0,
  hp_delta REAL DEFAULT 0, mass_delta REAL DEFAULT 0, special TEXT
);
CREATE TABLE IF NOT EXISTS artifact_type (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, source_world TEXT, effect TEXT,
  params_json TEXT
);

-- ===== ВСЕЛЕННАЯ =====
CREATE TABLE IF NOT EXISTS system (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, type_id TEXT REFERENCES system_type(id),
  star_class TEXT, epoch_ms INTEGER, time_scale REAL DEFAULT 1,
  px_per_au REAL DEFAULT 185, seed TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS body (
  id TEXT PRIMARY KEY, system_id TEXT NOT NULL REFERENCES system(id),
  parent_id TEXT REFERENCES body(id),
  name TEXT NOT NULL, type_id TEXT REFERENCES body_type(id),
  orbit_a_au REAL, orbit_period_days REAL, orbit_epoch_deg REAL,
  orbit_incl_deg REAL DEFAULT 0, radius_km REAL, radius_px REAL,
  color TEXT, role TEXT,                       -- role: arena/factory/workshop/betting/scrapyard/front/...
  is_habitable INTEGER DEFAULT 0, params_json TEXT
);
CREATE TABLE IF NOT EXISTS body_resource (
  body_id TEXT NOT NULL REFERENCES body(id), resource TEXT NOT NULL,
  abundance REAL, PRIMARY KEY (body_id, resource)
);
CREATE TABLE IF NOT EXISTS route (
  id TEXT PRIMARY KEY, system_id TEXT REFERENCES system(id),
  from_id TEXT REFERENCES body(id), to_id TEXT REFERENCES body(id),
  kind TEXT,                                   -- trade|fleet|belt|portal|moon
  length_px REAL, bulge_px REAL, params_json TEXT
);
CREATE TABLE IF NOT EXISTS race_event (
  id TEXT PRIMARY KEY, system_id TEXT REFERENCES system(id),
  arena_body_id TEXT REFERENCES body(id), period_s INTEGER, race_s INTEGER,
  gather_s INTEGER, laps INTEGER, rewards_json TEXT
);
CREATE TABLE IF NOT EXISTS clone_set (
  id TEXT PRIMARY KEY, name TEXT, str INTEGER, rea INTEGER, arm INTEGER,
  acc INTEGER, end_ INTEGER, psi INTEGER, cost INTEGER
);
CREATE TABLE IF NOT EXISTS weapon_type (
  id TEXT PRIMARY KEY, name TEXT, source_world TEXT,
  dmg REAL, rate REAL, crit REAL, params_json TEXT
);
CREATE TABLE IF NOT EXISTS physics_rule (
  id TEXT PRIMARY KEY, name TEXT, value REAL, unit TEXT, applies_to TEXT, note TEXT
);
