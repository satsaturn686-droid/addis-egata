import { pool } from "../db.js";

const TEST_DRAW_NAME = "መከራ ዕጣ";

export async function resetTestDraw(
  adminUserId: string,
  drawId: string,
): Promise<void> {
  if (!pool) {
    throw new Error("DATABASE_URL is not configured");
  }

  if (!adminUserId.trim()) {
    throw new Error("INVALID_ADMIN_USER_ID");
  }

  const normalizedDrawId = drawId.trim();

  if (!normalizedDrawId) {
    throw new Error("INVALID_DRAW_ID");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const drawResult = await client.query<{
      id: string;
      name: string;
      status: string;
    }>(
      `
        SELECT id, name, status
        FROM draws
        WHERE id = $1
        FOR UPDATE
      `,
      [normalizedDrawId],
    );

    const draw = drawResult.rows[0];

    if (!draw) {
      throw new Error("DRAW_NOT_FOUND");
    }

    if (draw.name !== TEST_DRAW_NAME) {
      throw new Error("TEST_DRAW_ONLY");
    }

    if (draw.status !== "completed") {
      throw new Error("TEST_DRAW_NOT_COMPLETED");
    }

    const resultCheck = await client.query<{ id: string }>(
      `
        SELECT id
        FROM draw_results
        WHERE draw_id = $1
        FOR UPDATE
      `,
      [normalizedDrawId],
    );

    if (resultCheck.rows.length === 0) {
      throw new Error("TEST_DRAW_RESULT_NOT_FOUND");
    }

    /*
     * Reverse any wallet credits from this test draw.
     * Wallet ledger rows are preserved; a compensating
     * transaction records each reversal.
     */
    const creditsResult = await client.query<{
      winner_id: string;
      user_id: string;
      amount: string;
      wallet_transaction_id: string | null;
    }>(
      `
        SELECT
          c.winner_id,
          c.user_id,
          c.amount,
          c.wallet_transaction_id
        FROM winner_wallet_credits c
        INNER JOIN winners w
          ON w.id = c.winner_id
        WHERE w.draw_id = $1
        FOR UPDATE OF c
      `,
      [normalizedDrawId],
    );

    for (const credit of creditsResult.rows) {
      const amount = Number(credit.amount);

      if (
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !credit.wallet_transaction_id
      ) {
        throw new Error("TEST_DRAW_WALLET_CREDIT_INVALID");
      }

      const transactionResult = await client.query<{
        id: string;
        amount: string;
        reference: string | null;
        type: string;
      }>(
        `
          SELECT id, amount, reference, type
          FROM wallet_transactions
          WHERE id = $1
          FOR UPDATE
        `,
        [credit.wallet_transaction_id],
      );

      const originalTransaction = transactionResult.rows[0];

      if (
        !originalTransaction ||
        originalTransaction.type !== "payout_credit" ||
        originalTransaction.reference !==
          `winner-payout:${credit.winner_id}` ||
        Number(originalTransaction.amount) !== amount
      ) {
        throw new Error("TEST_DRAW_WALLET_CREDIT_INVALID");
      }

      const walletResult = await client.query<{
        balance: string;
      }>(
        `
          SELECT balance
          FROM wallets
          WHERE user_id = $1
          FOR UPDATE
        `,
        [credit.user_id],
      );

      const wallet = walletResult.rows[0];

      if (!wallet) {
        throw new Error("TEST_DRAW_WALLET_NOT_FOUND");
      }

      const currentBalance = Number(wallet.balance);

      if (
        !Number.isFinite(currentBalance) ||
        currentBalance < amount
      ) {
        throw new Error("TEST_DRAW_PAYOUT_ALREADY_SPENT");
      }

      const newBalance = Number(
        (currentBalance - amount).toFixed(2),
      );

      await client.query(
        `
          UPDATE wallets
          SET balance = $1, updated_at = NOW()
          WHERE user_id = $2
        `,
        [newBalance, credit.user_id],
      );

      await client.query(
        `
          INSERT INTO wallet_transactions (
            user_id,
            type,
            amount,
            balance_after,
            reference,
            description
          )
          VALUES ($1, 'payout_credit', $2, $3, $4, $5)
        `,
        [
          credit.user_id,
          -amount,
          newBalance,
          `winner-payout-reset:${credit.winner_id}`,
          "Test draw reset payout reversal",
        ],
      );

      await client.query(
        `
          INSERT INTO audit_logs (
            user_id,
            action,
            entity_type,
            entity_id,
            details
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          adminUserId,
          "TEST_DRAW_WALLET_PAYOUT_REVERSED",
          "winner",
          credit.winner_id,
          JSON.stringify({
            drawId: normalizedDrawId,
            amount,
            previousBalance: currentBalance,
            newBalance,
            reason: "Test draw reset",
          }),
        ],
      );

      await client.query(
        `
          DELETE FROM winner_wallet_credits
          WHERE winner_id = $1
        `,
        [credit.winner_id],
      );
    }

    await client.query(
      `DELETE FROM winner_payouts WHERE draw_id = $1`,
      [normalizedDrawId],
    );

    await client.query(
      `DELETE FROM winners WHERE draw_id = $1`,
      [normalizedDrawId],
    );

    await client.query(
      `DELETE FROM draw_results WHERE draw_id = $1`,
      [normalizedDrawId],
    );

    await client.query(
      `
        UPDATE draws
        SET
          status = 'full',
          draw_at = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [normalizedDrawId],
    );

    await client.query(
      `
        INSERT INTO audit_logs (
          user_id,
          action,
          entity_type,
          entity_id,
          details
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        adminUserId,
        "TEST_DRAW_RESET",
        "draw",
        normalizedDrawId,
        JSON.stringify({
          name: draw.name,
          previousStatus: draw.status,
          resetAt: new Date().toISOString(),
          preservedPaidEntries: true,
          reversedWalletCredits: creditsResult.rows.length,
        }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
