const fs = require("fs");
const path = require("path");

const { config } = require("../lib/env.cjs");
const { createPool } = require("../lib/postgres.cjs");
const { runMigrations } = require("../lib/migrations.cjs");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

async function ensureDir(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function main() {
  const pool = createPool();
  try {
    await runMigrations(pool, MIGRATIONS_DIR);
    const snapshot = {};
    const tables = ["users", "farm_states", "sessions", "auth_tokens", "schema_migrations"];
    for (const table of tables) {
      const result = await pool.query(`SELECT * FROM ${table}`);
      snapshot[table] = result.rows;
    }

    await ensureDir(config.backupDir);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(config.backupDir, `backup-${stamp}.json`);
    await fs.promises.writeFile(
      backupPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          environment: config.nodeEnv,
          tables: snapshot,
        },
        null,
        2,
      ),
      "utf8",
    );

    const files = (await fs.promises.readdir(config.backupDir))
      .filter((name) => name.startsWith("backup-") && name.endsWith(".json"))
      .sort()
      .reverse();
    const oldFiles = files.slice(config.backupRetentionCount);
    await Promise.all(
      oldFiles.map((name) => fs.promises.unlink(path.join(config.backupDir, name)).catch(() => {})),
    );

    console.log(`[farm-api] backup created at ${backupPath}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[farm-api] backup failed: ${error.message}`);
  process.exit(1);
});
