const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const { createPool, withTransaction } = require("../lib/postgres.cjs");
const { runMigrations } = require("../lib/migrations.cjs");

const SQLITE_PATH = process.env.SQLITE_SOURCE_PATH || path.join(__dirname, "..", "data", "farm-auth.db");
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

function readSqliteRows(db, sql) {
  return db.prepare(sql).all();
}

function safeJson(text, fallback = {}) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function main() {
  if (!fs.existsSync(SQLITE_PATH)) {
    throw new Error(`ملف SQLite المصدر غير موجود: ${SQLITE_PATH}`);
  }

  const sqlite = new DatabaseSync(SQLITE_PATH, { readOnly: true });
  const pool = createPool();

  try {
    await runMigrations(pool, MIGRATIONS_DIR);

    const users = readSqliteRows(sqlite, "SELECT * FROM users");
    const states = readSqliteRows(sqlite, "SELECT * FROM farm_states");
    const sessions = readSqliteRows(sqlite, "SELECT * FROM sessions");

    await withTransaction(pool, async (client) => {
      for (const user of users) {
        await client.query(
          `
            INSERT INTO users (
              id, full_name, farm_name, email, password_hash, password_salt, plan, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
              full_name = EXCLUDED.full_name,
              farm_name = EXCLUDED.farm_name,
              email = EXCLUDED.email,
              password_hash = EXCLUDED.password_hash,
              password_salt = EXCLUDED.password_salt,
              plan = EXCLUDED.plan,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at
          `,
          [
            user.id,
            user.full_name,
            user.farm_name,
            user.email,
            user.password_hash,
            user.password_salt,
            user.plan || "trial",
            user.created_at,
            user.updated_at,
          ],
        );
      }

      for (const state of states) {
        await client.query(
          `
            INSERT INTO farm_states (user_id, state_json, updated_at)
            VALUES ($1, $2::jsonb, $3)
            ON CONFLICT (user_id) DO UPDATE SET
              state_json = EXCLUDED.state_json,
              updated_at = EXCLUDED.updated_at
          `,
          [
            state.user_id,
            JSON.stringify(safeJson(state.state_json, {})),
            state.updated_at,
          ],
        );
      }

      for (const session of sessions) {
        await client.query(
          `
            INSERT INTO sessions (id, user_id, token_hash, created_at, last_seen_at, expires_at)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
              user_id = EXCLUDED.user_id,
              token_hash = EXCLUDED.token_hash,
              created_at = EXCLUDED.created_at,
              last_seen_at = EXCLUDED.last_seen_at,
              expires_at = EXCLUDED.expires_at
          `,
          [
            session.id,
            session.user_id,
            session.token_hash,
            session.created_at,
            session.last_seen_at,
            session.expires_at,
          ],
        );
      }
    });

    console.log(
      `[farm-api] migrated SQLite -> Postgres | users=${users.length} | states=${states.length} | sessions=${sessions.length}`,
    );
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[farm-api] SQLite migration failed: ${error.message}`);
  process.exit(1);
});
