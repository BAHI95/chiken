const fs = require("fs");
const path = require("path");

const { createPool, withTransaction } = require("../lib/postgres.cjs");
const { runMigrations } = require("../lib/migrations.cjs");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
const backupFile = process.argv[2];

async function main() {
  if (!backupFile) {
    throw new Error("مرر مسار ملف النسخة الاحتياطية JSON كوسيط أول");
  }

  const absolute = path.resolve(backupFile);
  const raw = await fs.promises.readFile(absolute, "utf8");
  const payload = JSON.parse(raw);
  const tables = payload.tables || {};

  const pool = createPool();
  try {
    await runMigrations(pool, MIGRATIONS_DIR);
    await withTransaction(pool, async (client) => {
      await client.query("TRUNCATE TABLE auth_tokens, sessions, farm_states, users RESTART IDENTITY CASCADE");

      for (const row of tables.users || []) {
        await client.query(
          `
            INSERT INTO users (
              id, full_name, farm_name, email, password_hash, password_salt, plan, created_at, updated_at, email_verified_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `,
          [
            row.id,
            row.full_name,
            row.farm_name,
            row.email,
            row.password_hash,
            row.password_salt,
            row.plan,
            row.created_at,
            row.updated_at,
            row.email_verified_at || null,
          ],
        );
      }

      for (const row of tables.farm_states || []) {
        await client.query(
          "INSERT INTO farm_states (user_id, state_json, updated_at) VALUES ($1, $2::jsonb, $3)",
          [row.user_id, JSON.stringify(row.state_json || {}), row.updated_at],
        );
      }

      for (const row of tables.sessions || []) {
        await client.query(
          `
            INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at)
            VALUES ($1,$2,$3,$4,$5,$6)
          `,
          [row.id, row.user_id, row.token_hash, row.created_at, row.last_seen_at, row.expires_at],
        );
      }

      for (const row of tables.auth_tokens || []) {
        await client.query(
          `
            INSERT INTO auth_tokens (id, user_id, type, token_hash, created_at, expires_at, consumed_at, meta_json)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
          `,
          [
            row.id,
            row.user_id,
            row.type,
            row.token_hash,
            row.created_at,
            row.expires_at,
            row.consumed_at || null,
            JSON.stringify(row.meta_json || {}),
          ],
        );
      }
    });

    console.log(`[farm-api] restore completed from ${absolute}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[farm-api] restore failed: ${error.message}`);
  process.exit(1);
});
