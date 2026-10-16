import { pool } from "../db.js";

export type CashWinnerWalletCredit = {
  winnerId: string;
  userId: string;
  amount: number;
  walletBalance: number;
  walletTransactionId: string;
};

export async function creditCashWinnerToWallet(
  winnerId: string,
): Promise<CashWinnerWalletCredit> {
  if (!winnerId) {
    throw new Error(
      "INVALID_WINNER_ID",
    );
  }

  if (!pool) {
    throw new Error(
      "DATABASE_URL is not configured",
    );
  }

  const client =
    await pool.connect();

  try {
    await client.query("BEGIN");

    const winnerResult =
      await client.query<{
        winner_id: string;
        user_id: string;
        prize_amount: string;
        prize_type: string;
      }>(
        `
          SELECT
            w.id AS winner_id,
            w.user_id,
            w.prize_amount,
            d.prize_type
          FROM winners w
          INNER JOIN draws d
            ON d.id = w.draw_id
          WHERE w.id = $1
          FOR UPDATE
        `,
        [winnerId],
      );

    if (
      winnerResult.rows.length === 0
    ) {
      throw new Error(
        "WINNER_NOT_FOUND",
      );
    }

    const winner =
      winnerResult.rows[0];

    if (
      winner.prize_type !==
      "cash"
    ) {
      throw new Error(
        "WINNER_PRIZE_IS_NOT_CASH",
      );
    }

    const amount =
      Number(
        winner.prize_amount,
      );

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "INVALID_WINNER_PRIZE_AMOUNT",
      );
    }

    const existingResult =
      await client.query<{
        id: string;
        wallet_transaction_id:
          | string
          | null;
      }>(
        `
          SELECT
            id,
            wallet_transaction_id
          FROM winner_wallet_credits
          WHERE winner_id = $1
          FOR UPDATE
        `,
        [winnerId],
      );

    if (
      existingResult.rows.length > 0
    ) {
      const existing =
        existingResult.rows[0];

      const walletResult =
        await client.query<{
          balance: string;
        }>(
          `
            SELECT balance
            FROM wallets
            WHERE user_id = $1
          `,
          [winner.user_id],
        );

      await client.query("COMMIT");

      return {
        winnerId,
        userId:
          winner.user_id,
        amount,
        walletBalance:
          Number(
            walletResult.rows[0]?.balance ??
              0,
          ),
        walletTransactionId:
          existing.wallet_transaction_id ??
          "",
      };
    }

    const walletResult =
      await client.query<{
        id: string;
        balance: string;
      }>(
        `
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = $1
          FOR UPDATE
        `,
        [winner.user_id],
      );

    if (
      walletResult.rows.length === 0
    ) {
      await client.query(
        `
          INSERT INTO wallets (
            user_id,
            balance
          )
          VALUES (
            $1,
            0
          )
        `,
        [winner.user_id],
      );
    }

    const lockedWalletResult =
      await client.query<{
        balance: string;
      }>(
        `
          SELECT balance
          FROM wallets
          WHERE user_id = $1
          FOR UPDATE
        `,
        [winner.user_id],
      );

    const currentBalance =
      Number(
        lockedWalletResult.rows[0]
          .balance,
      );

    const newBalance =
      currentBalance + amount;

    const creditResult =
      await client.query(
        `
          INSERT INTO winner_wallet_credits (
            winner_id,
            user_id,
            amount
          )
          VALUES (
            $1,
            $2,
            $3
          )
          ON CONFLICT (winner_id)
          DO NOTHING
          RETURNING id
        `,
        [
          winnerId,
          winner.user_id,
          amount,
        ],
      );

    if (
      creditResult.rows.length === 0
    ) {
      await client.query("COMMIT");

      return {
        winnerId,
        userId:
          winner.user_id,
        amount,
        walletBalance:
          currentBalance,
        walletTransactionId:
          "",
      };
    }

    await client.query(
      `
        UPDATE wallets
        SET
          balance = $1,
          updated_at = NOW()
        WHERE user_id = $2
      `,
      [
        newBalance,
        winner.user_id,
      ],
    );

    const transactionResult =
      await client.query<{
        id: string;
      }>(
        `
          INSERT INTO wallet_transactions (
            user_id,
            type,
            amount,
            balance_after,
            reference,
            description
          )
          VALUES (
            $1,
            'payout_credit',
            $2,
            $3,
            $4,
            $5
          )
          RETURNING id
        `,
        [
          winner.user_id,
          amount,
          newBalance,
          `winner-payout:${winnerId}`,
          "Cash winner payout",
        ],
      );

    await client.query(
      `
        UPDATE winner_wallet_credits
        SET
          wallet_transaction_id = $1
        WHERE winner_id = $2
      `,
      [
        transactionResult.rows[0]
          .id,
        winnerId,
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
        VALUES (
          $1,
          'WINNER_WALLET_PAYOUT_CREDITED',
          'winner',
          $2,
          $3
        )
      `,
      [
        winner.user_id,
        winnerId,
        JSON.stringify({
          amount,
          walletBalance:
            newBalance,
          walletTransactionId:
            transactionResult.rows[0]
              .id,
        }),
      ],
    );

    await client.query("COMMIT");

    return {
      winnerId,
      userId:
        winner.user_id,
      amount,
      walletBalance:
        newBalance,
      walletTransactionId:
        transactionResult.rows[0]
          .id,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
