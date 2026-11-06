-- ADDIS EGATA
-- Migration 0003: Workflow safety and audit improvements
-- Cloudflare D1 / SQLite

PRAGMA foreign_keys = ON;

-- 1. Telegram webhook update deduplication
CREATE TABLE IF NOT EXISTS processed_telegram_updates (
    update_id INTEGER PRIMARY KEY,
    processed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processed_updates_time
ON processed_telegram_updates(processed_at);


-- 2. Global payment reference registry
-- Prevents the same Telebirr reference being reused
-- between ticket payments and wallet deposits.

CREATE TABLE IF NOT EXISTS payment_references (
    reference TEXT PRIMARY KEY,
    kind TEXT NOT NULL
        CHECK (kind IN ('entry', 'wallet_deposit')),
    entity_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_references_entity
ON payment_references(entity_id);


-- 3. Draw random seed commitments
-- Seed hash can be published before the draw.
-- The seed itself remains private until an authorized reveal.

CREATE TABLE IF NOT EXISTS draw_seed_commits (
    draw_id TEXT PRIMARY KEY,
    seed_hex TEXT NOT NULL,
    seed_hash TEXT NOT NULL,
    committed_at TEXT NOT NULL,
    revealed_at TEXT,

    FOREIGN KEY (draw_id)
        REFERENCES draws(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_draw_seed_commits_hash
ON draw_seed_commits(seed_hash);


-- 4. Additional draw result details
-- Keeps the algorithm and audit information separate
-- from the eligible-entry snapshot.

CREATE TABLE IF NOT EXISTS draw_result_audits (
    id TEXT PRIMARY KEY,
    draw_id TEXT NOT NULL UNIQUE,
    algorithm TEXT NOT NULL,
    seed_hash TEXT NOT NULL,
    revealed_seed TEXT,
    eligible_count INTEGER NOT NULL,
    winner_snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revealed_at TEXT,

    FOREIGN KEY (draw_id)
        REFERENCES draws(id)
        ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_draw_result_audits_created
ON draw_result_audits(created_at);


-- 5. Prevent multiple pending withdrawal requests
-- for the same user.

CREATE UNIQUE INDEX IF NOT EXISTS uq_withdrawals_one_pending_per_user
ON withdrawals(user_id)
WHERE status = 'pending';


-- 6. Faster wallet history retrieval.

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_date
ON wallet_transactions(user_id, created_at DESC);


-- 7. Faster pending payment review.

CREATE INDEX IF NOT EXISTS idx_payments_pending
ON payments(created_at)
WHERE status = 'pending';


-- 8. Faster pending wallet deposit review.

CREATE INDEX IF NOT EXISTS idx_wallet_deposits_pending
ON wallet_deposits(created_at)
WHERE status = 'pending';


-- 9. Faster pending withdrawal review.

CREATE INDEX IF NOT EXISTS idx_withdrawals_pending
ON withdrawals(created_at)
WHERE status = 'pending';


-- 10. Faster winner and payout lookup.

CREATE INDEX IF NOT EXISTS idx_winners_user
ON winners(user_id, selected_at DESC);

CREATE INDEX IF NOT EXISTS idx_winner_payouts_user
ON winner_payouts(user_id, created_at DESC);


-- 11. Faster user entry lookup.

CREATE INDEX IF NOT EXISTS idx_entries_user_date
ON entries(user_id, created_at DESC);


-- 12. Faster published results.

CREATE INDEX IF NOT EXISTS idx_draw_results_published
ON draw_results(published_at)
WHERE published_at IS NOT NULL;
