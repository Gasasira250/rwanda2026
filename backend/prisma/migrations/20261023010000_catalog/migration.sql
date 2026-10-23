CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  subtitle    TEXT,
  icon        TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_status TEXT NOT NULL DEFAULT 'in' CHECK (stock_status IN ('in','order'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time    TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS financeable  BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS best_seller  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS hidden       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS icon         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_keys   JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS specs        JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS options      JSONB;

CREATE TABLE IF NOT EXISTS packages (
  sku        TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  size       TEXT,
  level      TEXT,
  icon       TEXT,
  image_key  TEXT,
  items      JSONB NOT NULL DEFAULT '[]'::jsonb,
  active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS pricing_tiers (
  min_qty   INTEGER PRIMARY KEY CHECK (min_qty >= 1),
  discount  NUMERIC(5,4) NOT NULL CHECK (discount >= 0 AND discount < 1),
  label     TEXT NOT NULL
);

INSERT INTO pricing_tiers (min_qty, discount, label) VALUES
  (1, 0, '1-19'), (20, 0.05, '20-49'), (50, 0.08, '50-99'), (100, 0.12, '100+')
ON CONFLICT (min_qty) DO UPDATE SET discount = EXCLUDED.discount, label = EXCLUDED.label;

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES ('logo_fee_rwf', '1200')
ON CONFLICT (key) DO NOTHING;