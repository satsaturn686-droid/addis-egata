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

migrate().catch((error) => {
  console.error("Migration runner failed:", error);
  process.exitCode = 1;
});
