import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

const schemaPath = path.join(currentDirectory, "schema.sql");

async function migrate() {
  const client = await pool.connect();

  try {
    const schema = await readFile(schemaPath, "utf8");

    await client.query("BEGIN");

    await client.query(schema);

    /*
     * Existing installations may still have the original
     * UNIQUE(draw_id, number) constraint on entries.
     *
     * That constraint prevents a released number from being
     * reused while preserving the historical entry row.
     *
     * Remove only the old uniqueness constraint. Do not delete
     * any entries or payment history.
     */
    await removeLegacyEntryNumberConstraint(client);

    /*
     * The new partial unique index allows historical entries
     * with the same number while guaranteeing that only one
     * active entry can hold a number at a time.
     */
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_entries_active_number
      ON entries(draw_id, number)
      WHERE status IN ('reserved', 'pending_payment', 'paid')
    `);

    /*
     * Existing installations may have been created with
     * ON DELETE CASCADE relationships. Remove those
     * destructive cascades so historical payment, winner,
     * and result records cannot disappear accidentally.
     */
    await removeDestructiveCascades(client);

    await client.query("COMMIT");

    console.log("Database migration completed successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Database migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

async function removeLegacyEntryNumberConstraint(
  client: import("pg").PoolClient,
): Promise<void> {
  const result = await client.query<{
    constraint_name: string;
  }>(`
    SELECT
      tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'UNIQUE'
      AND tc.table_schema = 'public'
      AND tc.table_name = 'entries'
  `);

  for (const row of result.rows) {
    const constraintName = row.constraint_name;

    const columnsResult = await client.query<{
      column_name: string;
    }>(
      `
        SELECT
          kcu.column_name
        FROM information_schema.key_column_usage kcu
        WHERE kcu.constraint_schema = 'public'
          AND kcu.constraint_name = $1
          AND kcu.table_name = 'entries'
        ORDER BY kcu.ordinal_position
      `,
      [constraintName],
    );

    const columns = columnsResult.rows.map(
      (column) => column.column_name,
    );

    if (
      columns.length === 2 &&
      columns[0] === "draw_id" &&
      columns[1] === "number"
    ) {
      await client.query(
        `
          ALTER TABLE entries
          DROP CONSTRAINT ${quoteIdentifier(constraintName)}
        `,
      );

      console.log(
        `Removed legacy entries constraint: ${constraintName}`,
      );
    }
  }
}

async function removeDestructiveCascades(
  client: import("pg").PoolClient,
): Promise<void> {
  const constraintResult = await client.query<{
    constraint_name: string;
    table_name: string;
  }>(`
    SELECT
      tc.constraint_name,
      tc.table_name
    FROM information_schema.table_constraints tc
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc.table_name IN (
        'payments',
        'winners',
        'draw_results'
      )
  `);

  for (const constraint of constraintResult.rows) {
    const constraintName = constraint.constraint_name;
    const tableName = constraint.table_name;

    const definitionResult = await client.query<{
      definition: string;
    }>(
      `
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conname = $1
          AND conrelid = $2::regclass
      `,
      [constraintName, `public.${tableName}`],
    );

    if (definitionResult.rows.length === 0) {
      continue;
    }

    const definition = definitionResult.rows[0].definition;

    if (!/ON DELETE CASCADE/i.test(definition)) {
      continue;
    }

    await client.query(
      `
        ALTER TABLE ${quoteIdentifier(tableName)}
        DROP CONSTRAINT ${quoteIdentifier(constraintName)}
      `,
    );

    const safeDefinition = definition.replace(
      /\s+ON DELETE CASCADE/gi,
      "",
    );

    await client.query(
      `
        ALTER TABLE ${quoteIdentifier(tableName)}
        ADD CONSTRAINT ${quoteIdentifier(constraintName)}
        ${safeDefinition}
      `,
    );
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

migrate().catch((error) => {
  console.error("Migration runner failed:", error);
  process.exitCode = 1;
});
