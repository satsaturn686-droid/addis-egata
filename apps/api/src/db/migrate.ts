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
     * Existing installations may have been created with
     * ON DELETE CASCADE relationships. Remove those
     * destructive cascades so historical payment, winner,
     * and result records cannot disappear accidentally.
     */

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

      if (definition.includes("ON DELETE CASCADE")) {
        await client.query(
          `
            ALTER TABLE ${quoteIdentifier(tableName)}
            DROP CONSTRAINT ${quoteIdentifier(constraintName)}
          `,
        );

        await client.query(
          `
            ALTER TABLE ${quoteIdentifier(tableName)}
            ADD CONSTRAINT ${quoteIdentifier(constraintName)}
            ${definition.replace(/\s+ON DELETE CASCADE/gi, "")}
          `,
        );
      }
    }

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

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

migrate().catch((error) => {
  console.error("Migration runner failed:", error);
  process.exitCode = 1;
});
