const path = require("path");
const { createPool } = require("../lib/postgres.cjs");
const { runMigrations } = require("../lib/migrations.cjs");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function main() {
  const pool = createPool();
  try {
    await runMigrations(pool, MIGRATIONS_DIR);
    console.log("[farm-api] migrations complete");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[farm-api] migration failed: ${error.message}`);
  process.exit(1);
});
