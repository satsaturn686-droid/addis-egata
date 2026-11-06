
-- ADDIS ዕጣ
-- Migration 0004: Telegram update processing leases

ALTER TABLE processed_telegram_updates
ADD COLUMN status TEXT NOT NULL DEFAULT 'processed'
CHECK (status IN ('processing', 'processed'));

ALTER TABLE processed_telegram_updates
ADD COLUMN lease_until TEXT;

ALTER TABLE processed_telegram_updates
ADD COLUMN lease_token TEXT;

ALTER TABLE processed_telegram_updates
ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_telegram_updates_lease
ON processed_telegram_updates(status, lease_until);
