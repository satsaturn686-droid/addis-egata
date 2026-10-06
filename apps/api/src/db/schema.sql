CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  telebirr_number TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payment_settings_single_row CHECK (id = 1)
);

INSERT INTO payment_settings (
  id,
  telebirr_number
)
VALUES (
  1,
  ''
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  prize_type TEXT NOT NULL
    CHECK (prize_type IN ('cash', 'physical')),
  prize_name TEXT NOT NULL,
  prize_image_url TEXT,
  prize_description TEXT,
  displayed_prize_value NUMERIC(12, 2),
  actual_prize_cost NUMERIC(12, 2),

  total_numbers INTEGER NOT NULL
    CHECK (total_numbers >= 5),

  entry_fee NUMERIC(12, 2) NOT NULL
    CHECK (entry_fee > 0),

  winner_count INTEGER NOT NULL
    CHECK (winner_count >= 5),

  unique_winners BOOLEAN NOT NULL DEFAULT TRUE,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'open',
        'full',
        'closed',
        'drawing',
        'completed',
        'cancelled'
      )
    ),

  starts_at TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  draw_at TIMESTAMPTZ,

  created_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_winner_count
    CHECK (winner_count <= total_numbers),

  CONSTRAINT valid_draw_schedule
    CHECK (
      deadline_at IS NULL
      OR starts_at IS NULL
      OR deadline_at > starts_at
    )
);

CREATE TABLE IF NOT EXISTS draw_prizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  draw_id UUID NOT NULL
    REFERENCES draws(id),

  rank INTEGER NOT NULL
    CHECK (rank >= 1),

  amount NUMERIC(12, 2) NOT NULL
    CHECK (amount >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(draw_id, rank)
);

CREATE TABLE IF NOT EXISTS entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  draw_id UUID NOT NULL
    REFERENCES draws(id),

  user_id UUID NOT NULL
    REFERENCES users(id),

  number INTEGER NOT NULL
    CHECK (number >= 1),

  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK (
      status IN (
        'reserved',
        'pending_payment',
        'paid',
        'rejected',
        'expired'
      )
    ),

  reserved_until TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  entry_id UUID NOT NULL
    REFERENCES entries(id),

  user_id UUID NOT NULL
    REFERENCES users(id),

  amount NUMERIC(12, 2) NOT NULL
    CHECK (amount > 0),

  payment_method TEXT NOT NULL DEFAULT 'telebirr'
    CHECK (payment_method = 'telebirr'),

  transaction_reference TEXT NOT NULL,

  sender_name TEXT,
  receipt_image_url TEXT,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'approved',
        'rejected'
      )
    ),

  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(transaction_reference)
);

CREATE TABLE IF NOT EXISTS winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  draw_id UUID NOT NULL
    REFERENCES draws(id),

  entry_id UUID NOT NULL
    REFERENCES entries(id),

  user_id UUID NOT NULL
    REFERENCES users(id),

  rank INTEGER NOT NULL
    CHECK (rank >= 1),

  prize_amount NUMERIC(12, 2) NOT NULL
    CHECK (prize_amount >= 0),

  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(draw_id, rank),
  UNIQUE(draw_id, entry_id)
);

CREATE TABLE IF NOT EXISTS draw_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  draw_id UUID NOT NULL UNIQUE
    REFERENCES draws(id),

  eligible_entry_count INTEGER NOT NULL
    CHECK (eligible_entry_count >= 0),

  eligible_entry_snapshot JSONB NOT NULL,

  random_seed_hash TEXT NOT NULL,

  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  executed_by UUID REFERENCES users(id),

  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID REFERENCES users(id),

  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,

  details JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

/*
 * Winner payout lifecycle
 *
 * awaiting_claim
 *      ↓
 * awaiting_screenshot
 *      ↓
 * awaiting_telebirr
 *      ↓
 * submitted
 *      ↓
 * approved
 *      ↓
 * paid
 *
 * rejected may happen from submitted/approved.
 *
 * Sensitive information is kept private and is
 * never posted into a public Telegram group.
 */
CREATE TABLE IF NOT EXISTS winner_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  winner_id UUID NOT NULL UNIQUE
    REFERENCES winners(id),

  draw_id UUID NOT NULL
    REFERENCES draws(id),

  user_id UUID NOT NULL
    REFERENCES users(id),

  prize_amount NUMERIC(12, 2) NOT NULL
    CHECK (prize_amount >= 0),

  payout_method TEXT NOT NULL DEFAULT 'telebirr'
    CHECK (payout_method = 'telebirr'),

  status TEXT NOT NULL DEFAULT 'awaiting_claim'
    CHECK (
      status IN (
        'awaiting_claim',
        'awaiting_screenshot',
        'awaiting_telebirr',
        'submitted',
        'approved',
        'paid',
        'rejected'
      )
    ),

  telebirr_number TEXT,
  telebirr_account_name TEXT,

  screenshot_file_id TEXT,
  screenshot_file_unique_id TEXT,

  claim_started_at TIMESTAMPTZ,
  screenshot_received_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,

  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,

  paid_by UUID REFERENCES users(id),
  paid_at TIMESTAMPTZ,

  payment_reference TEXT,

  rejection_reason TEXT,

  telegram_claim_message_id BIGINT,
  telegram_admin_message_id BIGINT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT winner_payout_telebirr_required
    CHECK (
      status NOT IN (
        'submitted',
        'approved',
        'paid'
      )
      OR (
        telebirr_number IS NOT NULL
        AND length(trim(telebirr_number)) > 0
      )
    )
);

CREATE INDEX IF NOT EXISTS idx_draws_status
  ON draws(status);

CREATE INDEX IF NOT EXISTS idx_draws_deadline
  ON draws(deadline_at);

CREATE INDEX IF NOT EXISTS idx_entries_draw
  ON entries(draw_id);

CREATE INDEX IF NOT EXISTS idx_entries_user
  ON entries(user_id);

CREATE INDEX IF NOT EXISTS idx_entries_status
  ON entries(status);

CREATE INDEX IF NOT EXISTS idx_entries_reservation
  ON entries(reserved_until);

CREATE UNIQUE INDEX IF NOT EXISTS uq_entries_active_number
  ON entries(draw_id, number)
  WHERE status IN ('reserved', 'pending_payment', 'paid');

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON payments(status);

CREATE INDEX IF NOT EXISTS idx_payments_user
  ON payments(user_id);

CREATE INDEX IF NOT EXISTS idx_payments_entry
  ON payments(entry_id);

CREATE INDEX IF NOT EXISTS idx_winners_draw
  ON winners(draw_id);

CREATE INDEX IF NOT EXISTS idx_winners_user
  ON winners(user_id);

CREATE INDEX IF NOT EXISTS idx_draw_results_draw
  ON draw_results(draw_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_winner_payouts_status
  ON winner_payouts(status);

CREATE INDEX IF NOT EXISTS idx_winner_payouts_user
  ON winner_payouts(user_id);

CREATE INDEX IF NOT EXISTS idx_winner_payouts_draw
  ON winner_payouts(draw_id);

CREATE INDEX IF NOT EXISTS idx_winner_payouts_created
  ON winner_payouts(created_at);
