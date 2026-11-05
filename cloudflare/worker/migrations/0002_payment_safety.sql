
CREATE UNIQUE INDEX uq_payments_active_entry
ON payments(entry_id)
WHERE status IN ('pending', 'approved');
