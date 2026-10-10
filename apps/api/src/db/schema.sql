
/*
 * Addis ዕጣ Wallet
 *
 * Wallet balance is the user's internal balance.
 *
 * Deposits:
 *   pending -> approved/rejected
 *
 * Purchases:
 *   balance is deducted atomically
 *   entry becomes paid atomically
 *
 * Withdrawals:
 *   pending -> paid/rejected
 *
 * Cash winner payouts:
 *   credited exactly once to wallet
 *
 * Wallet transactions are immutable ledger records.
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
  transaction_reference TEXT NOT NULL,
  sender_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  verified_by UUID REFERENCES users(id),
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(transaction_reference)
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
  reference TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(reference)
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

/*
 * Telebirr payment settings and wallet service hours.
 * Service hours use Ethiopia local time (Africa/Addis_Ababa).
 */
CREATE TABLE IF NOT EXISTS payment_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  telebirr_number TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  service_open_time TIME NOT NULL DEFAULT TIME '09:00',
  service_close_time TIME NOT NULL DEFAULT TIME '18:00'
);

/*
 * Safe additions for installations where payment_settings
 * already exists with only the original Telebirr columns.
 */
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
