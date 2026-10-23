CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name TEXT NOT NULL,
  country CHAR(2) NOT NULL DEFAULT 'RW' CHECK (country IN ('RW','UG')),
  school_type TEXT,
  district TEXT,
  learner_count INTEGER,
  tin TEXT,
  head_teacher TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_role TEXT,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  bank_preference TEXT,
  shule_plus BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'school_admin' CHECK (role IN ('school_admin','operations_admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS users_school_id_idx ON users(school_id);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  unit_price_rwf NUMERIC(14,2) NOT NULL CHECK (unit_price_rwf >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number BIGSERIAL UNIQUE,
  school_id UUID NOT NULL REFERENCES schools(id),
  created_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'submitted',
  currency CHAR(3) NOT NULL DEFAULT 'RWF',
  total_rwf NUMERIC(14,2) NOT NULL CHECK (total_rwf >= 0),
  payment_method TEXT NOT NULL,
  order_mode TEXT NOT NULL CHECK (order_mode IN ('full','hp')),
  delivery_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  frontend_order_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS orders_school_created_idx ON orders(school_id, created_at DESC);

CREATE TABLE IF NOT EXISTS financing_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id),
  requested_lender TEXT,
  deposit_percent NUMERIC(5,2) NOT NULL,
  repayment_unit TEXT NOT NULL CHECK (repayment_unit IN ('month','term')),
  repayment_count INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review','approved','declined','cancelled')),
  terms_version TEXT NOT NULL DEFAULT 'unapproved-demo-terms',
  submitted_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
