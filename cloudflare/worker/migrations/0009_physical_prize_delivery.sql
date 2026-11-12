
-- ADDIS ዕጣ
-- Migration 0009: Physical prize delivery notifications

PRAGMA foreign_keys = ON;

ALTER TABLE business_notifications
RENAME TO business_notifications_old;

CREATE TABLE business_notifications (
  id TEXT PRIMARY KEY,
  notification_key TEXT NOT NULL UNIQUE,

  event_type TEXT NOT NULL
    CHECK (
      event_type IN (
        'payment_approved',
        'payment_rejected',
        'winner_payout_paid',
        'physical_prize_delivered'
      )
    ),

  recipient_telegram_id TEXT NOT NULL,
  message_text TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),

  attempts INTEGER NOT NULL DEFAULT 0
    CHECK (attempts >= 0),

  next_attempt_at TEXT NOT NULL,
  lease_until TEXT,
  lease_token TEXT,
  last_error TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  CHECK (
    (status = 'sending'
      AND lease_until IS NOT NULL
      AND lease_token IS NOT NULL)
    OR
    (status <> 'sending'
      AND lease_until IS NULL
      AND lease_token IS NULL)
  ),

  CHECK (
    (status = 'sent' AND sent_at IS NOT NULL)
    OR
    (status <> 'sent' AND sent_at IS NULL)
  )
);

INSERT INTO business_notifications
SELECT * FROM business_notifications_old;

DROP TABLE business_notifications_old;

CREATE INDEX IF NOT EXISTS
idx_business_notifications_pending
ON business_notifications(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS
idx_business_notifications_lease
ON business_notifications(status, lease_until);
