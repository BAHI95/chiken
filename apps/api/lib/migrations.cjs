const fs = require("fs");
const path = require("path");

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadAppliedMigrations(pool) {
  const result = await pool.query("SELECT id FROM schema_migrations");
  return new Set(result.rows.map((row) => row.id));
}

async function runMigrations(pool, migrationsDir) {
  await ensureMigrationsTable(pool);
  const applied = await loadAppliedMigrations(pool);
  const files = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8").trim();
    if (!sql) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[farm-api] applied migration ${file}`);
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // best effort rollback
      }
      throw new Error(`فشل تطبيق migration ${file}: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

module.exports = {
  runMigrations,
};
