
PRAGMA foreign_keys = ON;

-- =========================================
-- ADDIS ዕጣ — Cloudflare D1 initial schema
-- Currency values are stored in cents.
-- Timestamps are ISO-8601 UTC strings.
-- =========================================

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0
    CHECK (is_admin IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE draws (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  prize_type TEXT NOT NULL
    CHECK (prize_type IN ('cash', 'physical')),
  prize_name TEXT NOT NULL,
  prize_image_url TEXT,
  prize_description TEXT,
  displayed_prize_value_cents INTEGER,
  actual_prize_cost_cents INTEGER,
  total_numbers INTEGER NOT NULL
    CHECK (total_numbers BETWEEN 1 AND 100000),
  entry_fee_cents INTEGER NOT NULL
    CHECK (entry_fee_cents > 0),
  winner_count INTEGER NOT NULL DEFAULT 1
    CHECK (winner_count >= 1),
  unique_winners INTEGER NOT NULL DEFAULT 1
    CHECK (unique_winners IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'open', 'full', 'closed',
      'drawing', 'completed', 'cancelled'
    )),
  starts_at TEXT,
  deadline_at TEXT,
  draw_at TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_draws_status
  ON draws(status);

CREATE INDEX idx_draws_created
  ON draws(created_at);

CREATE TABLE draw_prizes (
  id TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL REFERENCES draws(id),
  rank INTEGER NOT NULL CHECK (rank >= 1),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  created_at TEXT NOT NULL,
  UNIQUE(draw_id, rank)
);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL REFERENCES draws(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  number INTEGER NOT NULL CHECK (number >= 1),
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (status IN (
      'reserved', 'pending_payment', 'paid',
      'rejected', 'expired'
    )),
  reserved_until TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A number cannot be held by two active entries.
-- Rejected and expired entries do not block a number.
CREATE UNIQUE INDEX uq_entries_active_number
  ON entries(draw_id, number)
  WHERE status IN ('reserved', 'pending_payment', 'paid');

CREATE INDEX idx_entries_user
  ON entries(user_id, created_at);

CREATE INDEX idx_entries_draw_status
  ON entries(draw_id, status);

CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_method TEXT NOT NULL DEFAULT 'telebirr'
    CHECK (payment_method = 'telebirr'),
  transaction_reference TEXT NOT NULL UNIQUE,
  sender_name TEXT,
  receipt_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_payments_status
  ON payments(status, created_at);

CREATE INDEX idx_payments_user
  ON payments(user_id, created_at);

CREATE TABLE wallets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  balance_cents INTEGER NOT NULL DEFAULT 0
    CHECK (balance_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL
    CHECK (type IN (
      'deposit', 'purchase', 'refund',
      'payout_credit', 'withdrawal'
    )),
  amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
  balance_after_cents INTEGER NOT NULL
    CHECK (balance_after_cents >= 0),
  reference TEXT UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_wallet_transactions_user
  ON wallet_transactions(user_id, created_at);

CREATE TABLE wallet_deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  transaction_reference TEXT NOT NULL UNIQUE,
  sender_name TEXT,
  receipt_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  verified_by TEXT REFERENCES users(id),
  verified_at TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_wallet_deposits_status
  ON wallet_deposits(status, created_at);

CREATE TABLE withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  telebirr_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'rejected')),
  rejection_reason TEXT,
  processed_by TEXT REFERENCES users(id),
  processed_at TEXT,
  payment_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_withdrawals_status
  ON withdrawals(status, created_at);

CREATE TABLE draw_results (
  id TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL UNIQUE REFERENCES draws(id),
  eligible_entry_count INTEGER NOT NULL,
  eligible_entry_snapshot TEXT NOT NULL,
  random_seed_hash TEXT NOT NULL,
  executed_at TEXT NOT NULL,
  executed_by TEXT REFERENCES users(id),
  published_at TEXT
);

CREATE TABLE winners (
  id TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL REFERENCES draws(id),
  entry_id TEXT NOT NULL REFERENCES entries(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  rank INTEGER NOT NULL CHECK (rank >= 1),
  prize_amount_cents INTEGER NOT NULL
    CHECK (prize_amount_cents >= 0),
  selected_at TEXT NOT NULL,
  UNIQUE(draw_id, rank),
  UNIQUE(draw_id, entry_id)
);

CREATE TABLE winner_payouts (
  id TEXT PRIMARY KEY,
  winner_id TEXT NOT NULL UNIQUE REFERENCES winners(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  prize_type TEXT NOT NULL
    CHECK (prize_type IN ('cash', 'physical')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'awaiting_screenshot',
      'awaiting_telebirr', 'awaiting_recipient',
      'submitted', 'approved', 'paid', 'rejected'
    )),
  screenshot_file_id TEXT,
  telebirr_number TEXT,
  recipient_full_name TEXT,
  recipient_phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE payment_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telebirr_number TEXT NOT NULL DEFAULT '',
  service_enabled INTEGER NOT NULL DEFAULT 1
    CHECK (service_enabled IN (0, 1)),
  service_open_time TEXT NOT NULL DEFAULT '03:00',
  service_close_time TEXT NOT NULL DEFAULT '12:00',
  timezone TEXT NOT NULL DEFAULT 'Africa/Addis_Ababa',
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO payment_settings (
  id, telebirr_number, service_enabled,
  service_open_time, service_close_time,
  timezone, updated_at
) VALUES (
  1, '', 1, '03:00', '12:00',
  'Africa/Addis_Ababa', '2026-11-04T00:00:00.000Z'
);

CREATE TABLE user_states (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  state TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE telegram_bot_daily_starts (
  telegram_user_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  first_started_at TEXT NOT NULL,
  PRIMARY KEY (telegram_user_id, local_date)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_logs_created
  ON audit_logs(created_at);

-- Referral foundation
CREATE TABLE referral_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  code TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1
    CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  inviter_user_id TEXT NOT NULL REFERENCES users(id),
  invitee_user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'qualified', 'rejected')),
  qualified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (inviter_user_id <> invitee_user_id)
);

CREATE TABLE referral_rewards (
  id TEXT PRIMARY KEY,
  referral_id TEXT NOT NULL UNIQUE REFERENCES referrals(id),
  inviter_user_id TEXT NOT NULL REFERENCES users(id),
  reward_amount_cents INTEGER NOT NULL DEFAULT 1000
    CHECK (reward_amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'credited', 'rejected')),
  wallet_transaction_id TEXT REFERENCES wallet_transactions(id),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  credited_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
