
-- ADDIS ዕጣ
-- Migration 0007: Manual Telebirr payouts and ticket service hours

PRAGMA foreign_keys = ON;

-- Manual payout audit information
ALTER TABLE winner_payouts
ADD COLUMN transfer_reference TEXT;

ALTER TABLE winner_payouts
ADD COLUMN transfer_proof_file_id TEXT;

ALTER TABLE winner_payouts
ADD COLUMN transfer_proof_file_type TEXT;

ALTER TABLE winner_payouts
ADD COLUMN paid_by TEXT REFERENCES users(id);

ALTER TABLE winner_payouts
ADD COLUMN paid_at TEXT;

ALTER TABLE winner_payouts
ADD COLUMN rejection_reason TEXT;

-- Keep whether the customer sent a photo or a document
ALTER TABLE payments
ADD COLUMN receipt_file_type TEXT;

-- One Telebirr transfer reference cannot pay two prizes
CREATE UNIQUE INDEX IF NOT EXISTS
uq_winner_payouts_transfer_reference
ON winner_payouts(transfer_reference)
WHERE transfer_reference IS NOT NULL
  AND TRIM(transfer_reference) <> '';

-- Ethiopian clock: ከጠዋቱ 3 እስከ ምሽቱ 12
-- Equivalent international time: 09:00–18:00
UPDATE payment_settings
SET service_open_time = '09:00',
    service_close_time = '18:00',
    timezone = 'Africa/Addis_Ababa',
    updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
