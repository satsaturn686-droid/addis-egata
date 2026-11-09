-- ADDIS ዕጣ
-- Migration 0006: Reliable winner notification outbox

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS winner_notifications (
  id TEXT PRIMARY KEY,

  winner_id TEXT NOT NULL UNIQUE
    REFERENCES winners(id),

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
    (
      status = 'sending'
      AND lease_until IS NOT NULL
      AND lease_token IS NOT NULL
    )
    OR
    (
      status <> 'sending'
      AND lease_until IS NULL
      AND lease_token IS NULL
    )
  ),

  CHECK (
    (status = 'sent' AND sent_at IS NOT NULL)
    OR
    (status <> 'sent' AND sent_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_winner_notifications_pending
ON winner_notifications(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_winner_notifications_lease
ON winner_notifications(status, lease_until);
