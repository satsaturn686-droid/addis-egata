/*
 * Addis ዕጣ Wallet
 *
 * Existing wallet schema preserved.
 * Referral schema is additive only.
 */

CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'telebirr'
    CHECK (payment_method = 'telebirr'),
  transaction_reference TEXT NOT NULL UNIQUE,
  sender_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL
    CHECK (
      type IN (
        'deposit',
        'purchase',
        'refund',
        'payout_credit',
        'withdrawal'
      )
    ),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount <> 0),
  balance_after NUMERIC(12, 2) NOT NULL CHECK (balance_after >= 0),
  reference TEXT UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  telebirr_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'rejected')),
  rejection_reason TEXT,
  processed_by UUID REFERENCES users(id),
  processed_at TIMESTAMPTZ,
  payment_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS winner_wallet_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id UUID NOT NULL UNIQUE REFERENCES winners(id),
  user_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  wallet_transaction_id UUID REFERENCES wallet_transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telebirr_number TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  service_open_time TIME NOT NULL DEFAULT TIME '09:00',
  service_close_time TIME NOT NULL DEFAULT TIME '18:00'
);

ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS service_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS service_open_time TIME NOT NULL DEFAULT TIME '09:00';

ALTER TABLE payment_settings
  ADD COLUMN IF NOT EXISTS service_close_time TIME NOT NULL DEFAULT TIME '18:00';

CREATE INDEX IF NOT EXISTS idx_wallets_user
  ON wallets(user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_user
  ON wallet_deposits(user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_status
  ON wallet_deposits(status);

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_created
  ON wallet_deposits(created_at);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user
  ON wallet_transactions(user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created
  ON wallet_transactions(created_at);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user
  ON withdrawals(user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status
  ON withdrawals(status);

CREATE INDEX IF NOT EXISTS idx_withdrawals_created
  ON withdrawals(created_at);

CREATE INDEX IF NOT EXISTS idx_winner_wallet_credits_user
  ON winner_wallet_credits(user_id);

/*
 * Telegram daily /start analytics.
 */
CREATE TABLE IF NOT EXISTS telegram_bot_daily_starts (
  telegram_user_id BIGINT NOT NULL,
  local_date DATE NOT NULL,
  username TEXT,
  first_name TEXT,
  first_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (telegram_user_id, local_date)
);

CREATE INDEX IF NOT EXISTS telegram_bot_daily_starts_date_idx
  ON telegram_bot_daily_starts(local_date);

/*
 * ADDIS ዕጣ referral system.
 *
 * A referral is not rewarded just for opening the app.
 * Qualification requires a verified first payment.
 * Actual wallet credit will be implemented separately.
 */

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  inviter_user_id UUID NOT NULL REFERENCES users(id),
  invitee_user_id UUID NOT NULL UNIQUE REFERENCES users(id),

  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'qualified',
        'rejected'
      )
    ),

  first_verified_deposit_id UUID
    REFERENCES wallet_deposits(id),

  qualified_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT referrals_no_self_referral
    CHECK (inviter_user_id <> invitee_user_id)
);

CREATE INDEX IF NOT EXISTS referrals_inviter_created_idx
  ON referrals(inviter_user_id, created_at);

CREATE INDEX IF NOT EXISTS referrals_status_created_idx
  ON referrals(status, created_at);

CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL UNIQUE REFERENCES users(id),
  code TEXT NOT NULL UNIQUE,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  referral_id UUID NOT NULL UNIQUE REFERENCES referrals(id),
  inviter_user_id UUID NOT NULL REFERENCES users(id),

  reward_amount NUMERIC(12, 2) NOT NULL DEFAULT 10.00
    CHECK (reward_amount = 10.00),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'approved',
        'credited',
        'rejected'
      )
    ),

  wallet_transaction_id UUID
    REFERENCES wallet_transactions(id),

  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  credited_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_rewards_user_status_idx
  ON referral_rewards(inviter_user_id, status);

CREATE TABLE IF NOT EXISTS referral_monthly_contests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  contest_month DATE NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (
      status IN (
        'draft',
        'open',
        'closed',
        'approved',
        'paid'
      )
    ),

  total_budget NUMERIC(12, 2) NOT NULL DEFAULT 2500.00
    CHECK (total_budget = 2500.00),

  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referral_monthly_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  contest_id UUID NOT NULL
    REFERENCES referral_monthly_contests(id),

  user_id UUID NOT NULL REFERENCES users(id),

  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),

  prize_amount NUMERIC(12, 2) NOT NULL
    CHECK (
      (rank = 1 AND prize_amount = 500.00)
      OR
      (rank = 2 AND prize_amount = 300.00)
      OR
      (rank = 3 AND prize_amount = 200.00)
    ),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'approved',
        'paid',
        'rejected'
      )
    ),

  wallet_transaction_id UUID
    REFERENCES wallet_transactions(id),

  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(contest_id, user_id),
  UNIQUE(contest_id, rank)
);

CREATE TABLE IF NOT EXISTS referral_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  referral_id UUID REFERENCES referrals(id),
  reward_id UUID REFERENCES referral_rewards(id),

  actor_user_id UUID REFERENCES users(id),

  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_audit_logs_created_idx
  ON referral_audit_logs(created_at);
