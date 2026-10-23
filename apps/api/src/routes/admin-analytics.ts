
import { Router } from "express";
import { pool } from "../db.js";
import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

const router = Router();

router.use(requireTelegramAuth, requireAdmin);

router.get("/", async (_req, res) => {
  try {
        if (!pool) {
      throw new Error("DATABASE_URL is not configured");
    }
    const result = await pool.query(`
      SELECT
        (NOW() AT TIME ZONE 'Africa/Addis_Ababa')::date
          AS local_date,

        (SELECT COUNT(*)::int
         FROM users) AS total_users,

        (SELECT COUNT(*)::int
         FROM telegram_bot_daily_starts
         WHERE local_date =
           (NOW() AT TIME ZONE 'Africa/Addis_Ababa')::date)
          AS today_bot_starts,

        (SELECT COUNT(*)::int
         FROM entries
         WHERE status = 'paid') AS paid_entries,

        (SELECT COUNT(*)::int
         FROM entries
         WHERE status IN ('reserved', 'pending_payment'))
          AS unpaid_entries,

        (SELECT COALESCE(SUM(amount), 0)::numeric
         FROM payments
         WHERE status = 'approved') AS approved_payment_amount,

        (SELECT COUNT(*)::int
         FROM payments
         WHERE status = 'pending') AS pending_payments,

        (SELECT COALESCE(SUM(balance), 0)::numeric
         FROM wallets) AS total_wallet_balance,

        (SELECT COUNT(*)::int
         FROM wallet_deposits
         WHERE status = 'pending') AS pending_wallet_deposits,

        (SELECT COUNT(*)::int
         FROM withdrawals
         WHERE status = 'pending') AS pending_withdrawals
    `);

    res.status(200).json({
      analytics: result.rows[0],
    });
  } catch (error) {
    console.error("Admin analytics error:", error);

    res.status(500).json({
      error: "ADMIN_ANALYTICS_LOAD_FAILED",
      message: "Analytics data could not be loaded.",
    });
  }
});

export default router;
