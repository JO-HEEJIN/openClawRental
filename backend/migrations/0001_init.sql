-- OpenClaw D1 Schema Migration: Initial setup (9 entities)
-- Database: Cloudflare D1 (SQLite)
-- Architecture: D1 transactions for concurrency (no Durable Objects)

-- 1. USER
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,                           -- ULID
  kakao_id TEXT NOT NULL UNIQUE,                 -- Kakao account ID
  email TEXT UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  profile_image_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  locale TEXT NOT NULL DEFAULT 'ko-KR',
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  is_active INTEGER NOT NULL DEFAULT 1,          -- boolean
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_user_kakao_id ON user(kakao_id);
CREATE INDEX idx_user_email ON user(email);

-- 2. CREDIT_BALANCE
-- Concurrency controlled via D1 batch transactions (no Durable Objects)
CREATE TABLE IF NOT EXISTS credit_balance (
  user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
  total_credits INTEGER NOT NULL DEFAULT 0,
  used_credits INTEGER NOT NULL DEFAULT 0,
  reserved_credits INTEGER NOT NULL DEFAULT 0,
  available_credits INTEGER GENERATED ALWAYS AS (total_credits - used_credits - reserved_credits) STORED,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (total_credits - used_credits - reserved_credits >= 0)
);

-- 3. PAYMENT_ORDER
CREATE TABLE IF NOT EXISTS payment_order (
  id TEXT PRIMARY KEY,                           -- ULID
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  merchant_uid TEXT NOT NULL UNIQUE,             -- openclaw_{ulid}
  imp_uid TEXT UNIQUE,                           -- PortOne payment ID
  package_code TEXT NOT NULL,
  amount_krw INTEGER NOT NULL,
  credits_to_grant INTEGER NOT NULL,
  pay_method TEXT CHECK (pay_method IN ('card', 'vbank', 'kakaopay', 'naverpay', 'phone')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'vbank_issued')),
  vbank_num TEXT,
  vbank_date TEXT,
  pg_provider TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_payment_order_user_id ON payment_order(user_id);
CREATE INDEX idx_payment_order_merchant_uid ON payment_order(merchant_uid);
CREATE INDEX idx_payment_order_imp_uid ON payment_order(imp_uid);
CREATE INDEX idx_payment_order_status ON payment_order(status);

-- 4. CREDIT_TRANSACTION
CREATE TABLE IF NOT EXISTS credit_transaction (
  id TEXT PRIMARY KEY,                           -- ULID
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  payment_order_id TEXT REFERENCES payment_order(id),
  agent_run_id TEXT,                             -- FK added after agent_run table
  type TEXT NOT NULL CHECK (type IN ('purchase', 'usage', 'reservation', 'settlement', 'refund', 'bonus', 'trial')),
  amount INTEGER NOT NULL,                       -- positive for credit, negative for debit
  balance_after INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_credit_transaction_user_id ON credit_transaction(user_id);
CREATE INDEX idx_credit_transaction_type ON credit_transaction(type);
CREATE INDEX idx_credit_transaction_created_at ON credit_transaction(created_at);

-- 5. WEBHOOK_EVENT
CREATE TABLE IF NOT EXISTS webhook_event (
  id TEXT PRIMARY KEY,                           -- ULID
  idempotency_key TEXT NOT NULL UNIQUE,          -- imp_uid + '_' + event_type
  imp_uid TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_webhook_event_imp_uid ON webhook_event(imp_uid);
CREATE INDEX idx_webhook_event_idempotency_key ON webhook_event(idempotency_key);

-- 6. AGENT_CONFIG
CREATE TABLE IF NOT EXISTS agent_config (
  id TEXT PRIMARY KEY,                           -- ULID
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  agent_template_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  estimated_credits_per_run INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agent_config_user_id ON agent_config(user_id);
CREATE INDEX idx_agent_config_status ON agent_config(status);

-- 7. AGENT_RUN
CREATE TABLE IF NOT EXISTS agent_run (
  id TEXT PRIMARY KEY,                           -- ULID
  agent_config_id TEXT NOT NULL REFERENCES agent_config(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  credits_actual INTEGER,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_agent_run_user_id ON agent_run(user_id);
CREATE INDEX idx_agent_run_agent_config_id ON agent_run(agent_config_id);
CREATE INDEX idx_agent_run_status ON agent_run(status);
CREATE INDEX idx_agent_run_created_at ON agent_run(created_at);

-- 8. USAGE_LOG
CREATE TABLE IF NOT EXISTS usage_log (
  id TEXT PRIMARY KEY,                           -- ULID
  agent_run_id TEXT NOT NULL REFERENCES agent_run(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL,                   -- e.g. 'llm_tokens', 'api_call', 'compute_ms'
  resource_detail TEXT NOT NULL DEFAULT '',       -- e.g. 'gpt-4o', 'youtube-data-api'
  quantity INTEGER NOT NULL DEFAULT 1,
  credit_cost INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_usage_log_agent_run_id ON usage_log(agent_run_id);
CREATE INDEX idx_usage_log_user_id ON usage_log(user_id);
CREATE INDEX idx_usage_log_resource_type ON usage_log(resource_type);

-- 9. CONSENT_RECORD
CREATE TABLE IF NOT EXISTS consent_record (
  id TEXT PRIMARY KEY,                           -- ULID
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms_of_service', 'privacy_policy', 'marketing')),
  consent_version TEXT NOT NULL,
  granted INTEGER NOT NULL DEFAULT 0,            -- boolean
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_consent_record_user_id ON consent_record(user_id);
CREATE INDEX idx_consent_record_type_version ON consent_record(consent_type, consent_version);
