-- Migration 0005: Atomic wallet operation tracking
-- Used to ensure that wallet ledger entries are created
-- only when the corresponding balance update succeeds.

ALTER TABLE wallets
ADD COLUMN last_operation_id TEXT;
